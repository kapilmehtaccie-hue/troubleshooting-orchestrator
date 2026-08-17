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
  await loadReports();
  await loadLLMConfigStatus();
  setupUIToggles();

  document.getElementById('test-llm-btn').addEventListener('click', testLLMConfig);
  document.getElementById('save-llm-btn').addEventListener('click', saveLLMConfig);
  document.getElementById('assign-btn').addEventListener('click', assignAndSend);
  document.getElementById('upload-problems-btn').addEventListener('click', uploadProblems);
  document.getElementById('download-sample-btn').addEventListener('click', downloadSampleCSV);
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
  document.getElementById('problem-source').addEventListener('change', async (e) => {
    document.getElementById('upload-area').classList.toggle('hidden', e.target.value !== 'upload');
    await loadProblems();
  });
}

async function loadLLMConfigStatus() {
  const { data: config } = await supabaseClient.from('llm_config').select('provider, custom_model, created_at').eq('orchestrator_id', currentProfile.id).maybeSingle();
  const statusEl = document.getElementById('llm-status');
  if (config) {
    statusEl.textContent = `Currently saved: ${config.provider} / ${config.custom_model} (last updated ${new Date(config.created_at).toLocaleString()}). Enter a new key above only if you want to change it.`;
  } else {
    statusEl.textContent = 'No LLM configured yet.';
  }
}

function getLLMFormValues() {
  return {
    provider: document.getElementById('llm-provider').value,
    apiKey: document.getElementById('llm-api-key').value.trim(),
    customEndpoint: document.getElementById('custom-endpoint').value.trim(),
    customModel: document.getElementById('custom-model').value.trim()
  };
}

async function testLLMConfig() {
  const statusEl = document.getElementById('llm-status');
  const config = getLLMFormValues();
  if (!config.apiKey || !config.customModel) { statusEl.textContent = 'API key and model name are required to test.'; return; }

  statusEl.textContent = 'Testing...';
  const res = await fetch('/api/testLLMConfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
    body: JSON.stringify(config)
  });
  const result = await res.json();
  statusEl.textContent = result.success ? '✅ Connection successful.' : `❌ Failed: ${result.error}`;
}

async function saveLLMConfig() {
  const statusEl = document.getElementById('llm-status');
  const config = getLLMFormValues();
  if (!config.apiKey || !config.customModel) { statusEl.textContent = 'API key and model name are required.'; return; }

  const res = await fetch('/api/saveLLMConfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
    body: JSON.stringify(config)
  });
  const result = await res.json();
  statusEl.textContent = result.success ? 'Saved successfully.' : `Error: ${result.error}`;
  if (result.success) await loadLLMConfigStatus();
}

async function loadProblems() {
  const source = document.getElementById('problem-source').value;
  let query = supabaseClient.from('problems').select('id, title').order('id');
  query = source === 'default'
    ? query.eq('is_default', true)
    : query.eq('created_by', currentProfile.id);

  const { data: problems } = await query;
  const select = document.getElementById('problem-select');
  if (!problems || problems.length === 0) {
    select.innerHTML = `<option value="">${source === 'upload' ? 'No uploaded problems yet — upload a file above' : 'No default problems found'}</option>`;
  } else {
    select.innerHTML = problems.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
  }
}

function stripBOM(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function parseCSVFull(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\r') { /* skip, handle \n separately */ }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else { field += char; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function parseDelimitedText(text) {
  const rows = parseCSVFull(text);
  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).filter(r => r.some(cell => cell && cell.trim())).map(row => {
    const obj = {};
    header.forEach((h, i) => obj[h] = (row[i] || '').trim());
    return obj;
  });
}

function parseXLSX(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map(r => {
    const normalized = {};
    Object.keys(r).forEach(k => normalized[k.trim().toLowerCase()] = String(r[k]).trim());
    return normalized;
  });
}

function validateAndNormalizeProblems(rawRows) {
  const errors = [];
  const valid = [];
  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2; // account for header row
    if (!row.title || !row.initial_statement || !row.hidden_root_cause) {
      errors.push(`Row ${rowNum}: missing required field (title, initial_statement, or hidden_root_cause).`);
      return;
    }
    valid.push({
      title: row.title,
      initial_statement: row.initial_statement,
      hidden_root_cause: row.hidden_root_cause,
      osi_layer: row.osi_layer || null,
      case_file: row.case_file || null,
      credit_start: parseInt(row.credit_start) || 10,
      question_limit: parseInt(row.question_limit) || 14,
      is_default: false,
      created_by: currentProfile.id
    });
  });
  return { valid, errors };
}

async function uploadProblems() {
  const statusEl = document.getElementById('upload-status');
  const file = document.getElementById('problem-file-upload').files[0];
  if (!file) { statusEl.textContent = 'Please choose a file first.'; return; }

  statusEl.textContent = 'Parsing...';
  let rawRows;
  try {
    if (file.name.endsWith('.xlsx')) {
      const buffer = await file.arrayBuffer();
      rawRows = parseXLSX(buffer);
    } else {
      const text = stripBOM(await file.text());
      rawRows = parseDelimitedText(text);
    }
  } catch (err) {
    statusEl.textContent = `Failed to parse file: ${err.message}`;
    return;
  }

  if (rawRows.length === 0) {
    statusEl.textContent = 'File appears empty, or only a header row was found.';
    return;
  }

  const { valid, errors } = validateAndNormalizeProblems(rawRows);

  if (valid.length === 0) {
    const preview = errors.slice(0, 3).join(' ');
    const more = errors.length > 3 ? ` (+${errors.length - 3} more similar errors)` : '';
    statusEl.textContent = `No valid rows found. ${preview}${more}`;
    console.warn('Full upload errors:', errors);
    return;
  }

  const { error } = await supabaseClient.from('problems').insert(valid);
  if (error) { statusEl.textContent = `Database error: ${error.message}`; return; }

  const errorNote = errors.length ? ` (${errors.length} row(s) skipped — check console for details)` : '';
  statusEl.textContent = `Uploaded ${valid.length} problem(s) successfully.${errorNote}`;
  if (errors.length) console.warn('Skipped rows:', errors);
  await loadProblems();
}

function downloadSampleCSV(e) {
  e.preventDefault();
  const sample = `title,initial_statement,hidden_root_cause,osi_layer,case_file,credit_start,question_limit
Slow VPN,"My VPN feels sluggish during video calls.","MTU mismatch causing fragmentation",L3/L4,"ENVIRONMENT: Office VPN client on split-tunnel config. TIMELINE: started after ISP router firmware update. SYMPTOMS: video calls degrade, file transfers unaffected. ACTION OUTCOMES: lowering MTU resolves it.",10,14`;
  const blob = new Blob([sample], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_problems.csv';
  a.click();
  URL.revokeObjectURL(url);
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
  if (!problemId) { statusEl.textContent = 'No problem selected.'; return; }
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

  const { error } = await supabaseClient.from('assignments').insert(rows).select();
  if (error) { statusEl.textContent = `DB Error: ${error.message}`; return; }

  statusEl.textContent = `Assigned ${participants.length} participant(s). Copy their link(s) from the table below.`;
  await loadAssignments();
  await loadReports();
}

async function loadAssignments() {
  const { data: assignments } = await supabaseClient
    .from('assignments')
    .select('id, token, participant_name, participant_email, status, assigned_at, problems(title)')
    .eq('orchestrator_id', currentProfile.id)
    .order('assigned_at', { ascending: false });

  const siteUrl = window.location.origin;
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
  `;
  }).join('');
}

async function loadReports() {
  const { data: sessions } = await supabaseClient
    .from('sessions')
    .select('id, ended_at, credit_remaining, turns_count, root_cause_identified, final_csat_avg, assignments(participant_name, participant_email, problems(title))')
    .order('id', { ascending: false });

  const tbody = document.querySelector('#reports-table tbody');
  tbody.innerHTML = (sessions || []).map(s => `
    <tr>
      <td>${s.assignments.participant_name}</td>
      <td>${s.assignments.participant_email}</td>
      <td>${s.assignments.problems.title}</td>
      <td>${s.ended_at ? 'Completed' : 'In Progress'}</td>
      <td>${s.final_csat_avg ?? '-'}</td>
      <td>${s.credit_remaining}</td>
      <td>${s.turns_count}</td>
      <td>${s.root_cause_identified ? 'Yes' : 'No'}</td>
      <td>${s.ended_at ? `<button onclick="downloadOrchReport(${s.id})">PDF</button>` : '-'}</td>
    </tr>
  `).join('');
}

async function downloadOrchReport(sessionId) {
  await fetchAndDownloadReport(sessionId, currentSession.access_token);
}
window.downloadOrchReport = downloadOrchReport;
