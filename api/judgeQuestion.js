import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const KEYWORDS = {
  assess: ['impact', 'business', 'topology', 'affected', 'when did', 'scope', 'who is'],
  acquire: ['log', 'ping', 'check', 'layer', 'does it happen', 'isolate', 'test', 'trace', 'interface', 'config', 'mobile', 'other device'],
  analyse: ['i think', 'hypothesis', 'root cause', 'suspect', 'likely'],
  act: ['reload', 'reboot', 'restart', 'replace', 'fix', 'restore', 'swap', 'change the']
};

function classifyPhase(text, isActionFlag) {
  const lower = text.toLowerCase();
  if (isActionFlag || KEYWORDS.act.some(k => lower.includes(k))) return 'act';
  if (KEYWORDS.acquire.some(k => lower.includes(k))) return 'acquire';
  if (KEYWORDS.analyse.some(k => lower.includes(k))) return 'analyse';
  if (KEYWORDS.assess.some(k => lower.includes(k))) return 'assess';
  return 'acquire';
}

function checkRootCauseMatch(text, hiddenRootCause) {
  const textWords = text.toLowerCase().split(/\W+/);
  const causeWords = hiddenRootCause.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const matches = causeWords.filter(w => textWords.includes(w));
  return matches.length >= Math.ceil(causeWords.length * 0.4);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { sessionId, questionText, isActionFlag } = req.body;
  if (!sessionId || !questionText) return res.status(400).json({ error: 'Missing fields' });

  const { data: session } = await supabaseAdmin.from('sessions').select('*, assignments(*)').eq('id', sessionId).single();
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.assignments.participant_email.toLowerCase() !== user.email.toLowerCase()) {
    return res.status(403).json({ error: 'Not your session' });
  }
  if (session.ended_at) return res.status(400).json({ error: 'Session already ended' });

  const { data: problem } = await supabaseAdmin.from('problems').select('*').eq('id', session.assignments.problem_id).single();

  const phase = classifyPhase(questionText, isActionFlag);
  let csat, creditDelta, feedback, rootCauseIdentified = false, evidenceDestroyed = session.evidence_destroyed, sessionEnded = false;

  if (phase === 'act') {
    const correct = checkRootCauseMatch(questionText, problem.hidden_root_cause);
    if (correct) {
      csat = 9; creditDelta = 1; rootCauseIdentified = true; sessionEnded = true;
      feedback = 'Correct root cause identified and action taken. Well-grounded in evidence.';
    } else {
      csat = 2; creditDelta = -3; evidenceDestroyed = true;
      feedback = 'This action was taken without sufficient evidence. It may have destroyed diagnostic data (logs, buffers) without resolving the issue. Continue investigating.';
    }
  } else {
    const specific = questionText.trim().length > 15;
    csat = specific ? 7 : 4;
    creditDelta = specific ? 1 : 0;
    feedback = specific
      ? `Good ${phase}-phase question — evidence-based and narrows the problem space.`
      : `This question is a bit vague for the ${phase} phase. Try to be more specific and evidence-based.`;
  }

  const newCredit = Math.max(0, session.credit_remaining - (creditDelta < 0 ? -creditDelta : 0)) + (creditDelta > 0 ? creditDelta : 0);
  const creditRemaining = Math.max(0, session.credit_remaining + creditDelta);
  const turnsCount = session.turns_count + 1;

  if (creditRemaining <= 0 || turnsCount >= problem.question_limit) sessionEnded = true;

  const updates = {
    current_phase: phase === 'act' ? session.current_phase : phase,
    credit_remaining: creditRemaining,
    turns_count: turnsCount,
    evidence_destroyed: evidenceDestroyed
  };
  if (sessionEnded) {
    updates.ended_at = new Date().toISOString();
    updates.final_csat_avg = null; // computed in Phase 6 report
    updates.final_credit = creditRemaining;
    updates.root_cause_identified = rootCauseIdentified;
    await supabaseAdmin.from('assignments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', session.assignment_id);
  } else {
    await supabaseAdmin.from('assignments').update({ status: 'in_progress' }).eq('id', session.assignment_id);
  }

  await supabaseAdmin.from('sessions').update(updates).eq('id', sessionId);
  await supabaseAdmin.from('question_log').insert({
    session_id: sessionId,
    turn_number: turnsCount,
    phase,
    question_text: questionText,
    ai_feedback: feedback,
    csat_score: csat,
    credit_delta: creditDelta,
    credit_remaining: creditRemaining
  });

  res.status(200).json({ phase, csat, creditDelta, creditRemaining, feedback, rootCauseIdentified, sessionEnded, turnsCount, questionLimit: problem.question_limit });
}
