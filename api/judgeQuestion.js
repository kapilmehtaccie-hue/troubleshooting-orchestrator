import { createClient } from '@supabase/supabase-js';
import { decrypt } from './_lib/crypto.js';
import { loadSkills } from './_lib/skills.js';
import { runSimulatorAgent } from './_lib/simulatorAgent.js';
import { runJudgeAgent } from './_lib/judgeAgent.js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const KEYWORDS = {
  assess: ['impact', 'business', 'topology', 'affected', 'when did', 'scope', 'who is'],
  acquire: ['log', 'ping', 'check', 'layer', 'does it happen', 'isolate', 'test', 'trace', 'interface', 'config', 'mobile', 'other device'],
  analyse: ['i think', 'hypothesis', 'root cause', 'suspect', 'likely'],
  act: ['reload', 'reboot', 'restart', 'replace', 'fix', 'restore', 'swap', 'change the']
};

function heuristicJudge(text, isActionFlag, hiddenRootCause) {
  const lower = text.toLowerCase();
  let phase = 'acquire';
  if (isActionFlag || KEYWORDS.act.some(k => lower.includes(k))) phase = 'act';
  else if (KEYWORDS.acquire.some(k => lower.includes(k))) phase = 'acquire';
  else if (KEYWORDS.analyse.some(k => lower.includes(k))) phase = 'analyse';
  else if (KEYWORDS.assess.some(k => lower.includes(k))) phase = 'assess';

  if (phase === 'act') {
    const causeWords = hiddenRootCause.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const matches = causeWords.filter(w => lower.includes(w));
    const correct = matches.length >= Math.ceil(causeWords.length * 0.4);
    return correct
      ? { phase, csat: 9, credit_delta: 1, feedback: 'Correct root cause identified.', root_cause_match: true, evidence_grounded: null }
      : { phase, csat: 2, credit_delta: -3, feedback: 'Action taken without sufficient evidence — may have destroyed diagnostic data.', root_cause_match: false, evidence_grounded: false };
  }
  const specific = text.trim().length > 15;
  return {
    phase,
    csat: specific ? 7 : 4,
    credit_delta: specific ? 1 : 0,
    feedback: specific ? `Reasonable ${phase}-phase question.` : `Question is vague for the ${phase} phase — be more specific.`,
    root_cause_match: false,
    evidence_grounded: null
  };
}

function fallbackSimulatedAnswer() {
  return "I'm not able to provide a detailed response right now (AI simulator temporarily unavailable) — please try rephrasing, or continue with the information already gathered.";
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
  const { data: history } = await supabaseAdmin.from('question_log').select('*').eq('session_id', sessionId).order('turn_number');
  const { data: llmConfigRow } = await supabaseAdmin.from('llm_config').select('*').eq('orchestrator_id', session.assignments.orchestrator_id).maybeSingle();

  let simulatedAnswer, judgment, usedFallback = false;
  const turnNumber = session.turns_count + 1;

  if (llmConfigRow) {
    try {
      const apiKey = decrypt(llmConfigRow.api_key_encrypted, process.env.LLM_KEY_ENCRYPTION_SECRET);
      const llmConfig = { provider: llmConfigRow.provider, apiKey, customEndpoint: llmConfigRow.custom_endpoint, customModel: llmConfigRow.custom_model };
      const skills = loadSkills();

      simulatedAnswer = await runSimulatorAgent(llmConfig, skills.simulator, problem, history || [], questionText, isActionFlag, turnNumber);
      judgment = await runJudgeAgent(llmConfig, skills.judge, problem, history || [], questionText, isActionFlag, simulatedAnswer, session.credit_remaining, turnNumber);
    } catch (err) {
      console.error('Agentic pipeline failed, using fallback:', err.message);
      simulatedAnswer = fallbackSimulatedAnswer();
      judgment = heuristicJudge(questionText, isActionFlag, problem.hidden_root_cause);
      usedFallback = true;
    }
  } else {
    simulatedAnswer = fallbackSimulatedAnswer();
    judgment = heuristicJudge(questionText, isActionFlag, problem.hidden_root_cause);
    usedFallback = true;
  }

  const phase = judgment.phase;
  const csat = Math.max(0, Math.min(10, judgment.csat));
  const creditDelta = Math.max(-3, Math.min(2, judgment.credit_delta));
  const evidenceGrounded = typeof judgment.evidence_grounded === 'boolean' ? judgment.evidence_grounded : null;
  let feedback = judgment.feedback + (usedFallback ? ' [Note: scored by fallback rules — AI judge unavailable]' : '');
  const rootCauseIdentified = phase === 'act' && !!judgment.root_cause_match;

  const creditRemaining = Math.max(0, session.credit_remaining + creditDelta);
  const turnsCount = turnNumber;
  const evidenceDestroyed = session.evidence_destroyed || (phase === 'act' && !rootCauseIdentified);
  let sessionEnded = rootCauseIdentified || creditRemaining <= 0 || turnsCount >= problem.question_limit;

  const updates = {
    current_phase: phase === 'act' && !rootCauseIdentified ? session.current_phase : phase,
    credit_remaining: creditRemaining,
    turns_count: turnsCount,
    evidence_destroyed: evidenceDestroyed
  };

  if (sessionEnded) {
    const allScores = [...(history || []).map(h => h.csat_score), csat];
    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    updates.ended_at = new Date().toISOString();
    updates.final_credit = creditRemaining;
    updates.root_cause_identified = rootCauseIdentified;
    updates.final_csat_avg = Math.round(avg * 10) / 10;
    await supabaseAdmin.from('assignments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', session.assignment_id);
  } else {
    await supabaseAdmin.from('assignments').update({ status: 'in_progress' }).eq('id', session.assignment_id);
  }

  await supabaseAdmin.from('sessions').update(updates).eq('id', sessionId);
  await supabaseAdmin.from('question_log').insert({
    session_id: sessionId, turn_number: turnsCount, phase, question_text: questionText,
    simulated_answer: simulatedAnswer,
    ai_feedback: feedback, csat_score: csat, credit_delta: creditDelta, credit_remaining: creditRemaining,
    evidence_grounded: evidenceGrounded
  });

  res.status(200).json({
    simulatedAnswer, phase, csat, creditDelta, creditRemaining, feedback,
    rootCauseIdentified, evidenceGrounded, sessionEnded, turnsCount, questionLimit: problem.question_limit, usedFallback
  });
}
