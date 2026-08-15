let currentSessionRow, currentAssignment, currentProblem, accessToken;

(async () => {
  await initSupabase();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const statusEl = document.getElementById('status-msg');
  if (!token) { statusEl.textContent = 'Invalid link — no token provided.'; return; }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
    return;
  }
  accessToken = session.access_token;

  const { data: assignment, error } = await supabaseClient.from('assignments').select('*').eq('token', token).single();
  if (error || !assignment) { statusEl.textContent = 'Assignment not found.'; return; }
  if (assignment.participant_email.toLowerCase() !== session.user.email.toLowerCase()) {
    statusEl.textContent = `This exercise is assigned to ${assignment.participant_email}, but you're logged in as ${session.user.email}.`;
    return;
  }
  currentAssignment = assignment;

  const { data: problem } = await supabaseClient.from('problems_public').select('*').eq('id', assignment.problem_id).single();
  currentProblem = problem;

  let { data: existingSession } = await supabaseClient.from('sessions').select('*').eq('assignment_id', assignment.id).is('ended_at', null).maybeSingle();
  if (!existingSession) {
    const { data: newSession } = await supabaseClient.from('sessions').insert({
      assignment_id: assignment.id, credit_remaining: problem.credit_start
    }).select().single();
    existingSession = newSession;
  }
  currentSessionRow = existingSession;

  statusEl.style.display = 'none';
  document.getElementById('exercise-area').style.display = 'block';
  document.getElementById('problem-statement').textContent = problem.initial_statement;
  updateStats(null, existingSession.credit_remaining, existingSession.turns_count, problem.question_limit);
  await loadPastTurns();

  if (existingSession.ended_at) {
    showEnded(existingSession.root_cause_identified);
  }

  document.getElementById('submit-btn').addEventListener('click', submitTurn);
})();

async function loadPastTurns() {
  const { data: logs } = await supabaseClient.from('question_log').select('*').eq('session_id', currentSessionRow.id).order('turn_number');
  const logEl = document.getElementById('turn-log');
  logEl.innerHTML = (logs || []).map(renderTurn).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function renderTurn(t) {
  return `<div class="turn">
    <div class="q"><strong>You [Turn ${t.turn_number}]:</strong> ${t.question_text}</div>
    <div class="a"><strong>Response:</strong> ${t.simulated_answer || '(no response recorded)'}</div>
    <div class="fb">[${t.phase}] CSAT ${t.csat_score}/10 | Credit Δ${t.credit_delta} — ${t.ai_feedback}</div>
  </div>`;
}

function updateStats(csat, credit, turn, limit) {
  document.getElementById('csat-val').textContent = csat ?? '-';
  document.getElementById('credit-val').textContent = credit;
  document.getElementById('turn-val').textContent = `${turn} / ${limit}`;
}

async function submitTurn() {
  const input = document.getElementById('question-input');
  const text = input.value.trim();
  if (!text) return;
  const isActionFlag = document.getElementById('action-flag').checked;

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Thinking...';

  const res = await fetch('/api/judgeQuestion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ sessionId: currentSessionRow.id, questionText: text, isActionFlag })
  });
  const result = await res.json();

  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit';

  if (result.error) { alert(result.error); return; }

  const logEl = document.getElementById('turn-log');
  logEl.innerHTML += renderTurn({
    turn_number: result.turnsCount, phase: result.phase, question_text: text,
    simulated_answer: result.simulatedAnswer, csat_score: result.csat,
    credit_delta: result.creditDelta, ai_feedback: result.feedback
  });
  logEl.scrollTop = logEl.scrollHeight;
  updateStats(result.csat, result.creditRemaining, result.turnsCount, result.questionLimit);
  input.value = '';
  document.getElementById('action-flag').checked = false;

  if (result.sessionEnded) showEnded(result.rootCauseIdentified);
}

function showEnded(rootCauseIdentified) {
  document.getElementById('question-input').disabled = true;
  document.getElementById('submit-btn').disabled = true;
  document.getElementById('session-ended-area').style.display = 'block';
  document.getElementById('end-message').textContent = rootCauseIdentified
    ? '✅ Root cause identified. Exercise complete.'
    : '⏹ Exercise ended (credit or question limit reached).';
  document.getElementById('report-btn').onclick = () => {
    fetchAndDownloadReport(currentSessionRow.id, accessToken);
  };
}
