let currentSession, currentProfile;

(async () => {
  await initSupabase();
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = '/index.html'; return; }
  currentSession = session;

  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
  currentProfile = profile;
  if (profile.role !== 'orchestrator') { window.location.href = '/participant.html'; return; }

  document.getElementById('welcome-msg').textContent = `Signed in as ${profile.name} (${profile.email})`;

  await loadProblems();
  await loadAssignments();
  setupUIToggles();

  document.getElementById('save-llm-btn').addEventListener('click', saveLLMConfig);
  document.getElementById('assign-btn').addEventListener('click', assignAndSend);
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = '/index.html';
  });
})();

function setupUIToggles() {
  document.getElementById('llm-provider').addEventListener('change', (e) => {
    document.getElementById('custom-fields').classList.toggle('hidden', e.target.value !== 'custom');
  });
  document.getElementById('entry-method').addEventListener('change', (e) => {
    document.getElementById('single-entry').classList.toggle('hidden', e.target.value !== 'single');
    document.getElementById('bulk-entry').classList.toggle('hidden', e.target.value !== 'bulk');
    document.getElementById('file-entry').classList.toggle('hidden', e.target.value !== 'file');
  });
}

async function loadProblems() {
  const { data: problems } = await supabaseClient.from('problems').select('id, title').order('id');
  const select = document.getElementById('problem-select');
  select.innerHTML = problems.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
}

async function saveLLMConfig() {
  const provider = document.getElementById('llm-provider').value;
  const apiKey = document.getElementById('llm-api-key').value.trim();
  const customEndpoint = document.getElementById('custom-endpoint').value.trim();
  const customModel = document.getElementById('custom-model').value.trim();

  if (!apiKey) { document.getElementById('llm-status').textContent = 'API key required.'; return; }

  const res = await fetch('/api/saveLLMConfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
    body: JSON.stringify({ provider, apiKey, customEndpoint, customModel })
  });
  const result = await res.json();
  document.getElementById('llm-status').textContent = result.success ? 'Saved successfully.' : `Error: ${result.error}`;
}

function parseBulkText(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [name, email] = line.split(',').map(s => s.trim());
    return { name, email };
  }).filter(p => p.name && p.email);
}

function readFileAsText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsText(file);
  });
}

async function assignAndSend() {
  const statusEl = document.getElementById('assign-status');
  statusEl.textContent = 'Processing...';

  const problemId = document.getElementById('problem-select').value;
  const method = document.getElementById('entry-method').value;

  let participants = [];
  if (method === 'single') {
    const name = document.getElementById('single-name').value.trim();
    const email = document.getElementById('single-email').value.trim();
    if (name && email) participants = [{ name, email }];
  } else if (method === 'bulk') {
    participants = parseBulkText(document.getElementById('bulk-text').value);
  } else if (method === 'file') {
    const file = document.getElementById('file-upload').files[0];
    if (file) {
      const text = await readFileAsText(file);
      participants = parseBulkText(text);
    }
  }

  if (participants.length === 0) {
    statusEl.textContent = 'No valid participants found.';
    return;
  }

  const rows = participants.map(p => ({
    orchestrator_id: currentProfile.id,
    participant_email: p.email,
    participant_name: p.name,
    problem_id: parseInt(problemId),
    status: 'assigned'
  }));

  const { data: inserted, error } = await supabaseClient.from('assignments').insert(rows).select();
  if (error) { statusEl.textContent = `DB Error: ${error.message}`; return; }

  statusEl.innerHTML = `Assigned ${participants.length} participant(s). Links below (also visible in table):`;
  await loadAssignments();
}

async function loadAssignments() {
  const { data: assignments } = await supabaseClient
    .from('assignments')
    .select('id, token, participant_name, participant_email, status, assigned_at, problems(title)')
    .eq('orchestrator_id', currentProfile.id)
    .order('assigned_at', { ascending: false });

  const siteUrl = 'https://troubleshooting-orchestrator.vercel.app';
  const tbody = document.querySelector('#assignments-table tbody');
  tbody.innerHTML = (assignments || []).map(a => {
    const link = `${siteUrl}/exercise.html?token=${a.token}`;
    return `
    <tr>
      <td>${a.participant_name}</td>
      <td>${a.participant_email}</td>
      <td>${a.problems?.title || ''}</td>
      <td>${a.status}</td>
      <td>${new Date(a.assigned_at).toLocaleString()}</td>
      <td><button onclick="navigator.clipboard.writeText('${link}')">Copy Link</button></td>
    </tr>
  `}).join('');
}
