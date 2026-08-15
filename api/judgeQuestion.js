import { createClient } from '@supabase/supabase-js';
import { decrypt } from './_lib/crypto.js';
import { callLLM } from './_lib/llmProviders.js';

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
      ? { phase, csat: 9, credit_delta: 1, feedback: 'Correct root cause identified.', root_cause_match: true }
      : { phase, csat: 2, credit_delta: -3, feedback: 'Action taken without sufficient evidence — may have destroyed diagnostic data.', root_cause_match: false };
  }
  const specific = text.trim().length > 15;
  return {
    phase,
    csat: specific ? 7 : 4,
    credit_delta: specific ? 1 : 0,
    feedback: specific ? `Reasonable ${phase}-phase question.` : `Question is vague for the ${phase} phase — be more specific.`,
    root_cause_match: false
  };
}

function buildSystemPrompt() {
  return `You are an AI judge for a network troubleshooting training exercise, based on the KTO-AI framework (Kepner-Tregoe, Topology awareness, OSI-layer mapping) and the 4A's Loop: Assess (situation appraisal, business impact, topology) -> Acquire (evidence gathering: OSI-layer checks, Is/Is-Not analysis) -> Analyse (forming a hypothesis grounded in acquired evidence) -> Act (verification/restoration action).

You will be given a hidden problem context (never shown to the trainee) and the trainee's latest input. Classify and score it.

Scoring bases (per the paper):
1. CSAT (0-10): reflects how logical, evidence-based, and non-redundant the input is, as a real customer's confidence would react. High-value Assess/Acquire questions that narrow the problem space score high. Vague, redundant, or blind-guess inputs score low. A blind Act without sufficient Acquire evidence should score very low (1-3) and be flagged as potentially destroying volatile evidence.
2. Question Credit delta (-3 to +2): a finite budget of customer patience. High-value questions: +1 or +2. Vague/redundant questions: 0. Blind action that fails: -2 or -3. Correct, well-supported action: +1 or +2.

Respond with ONLY a valid JSON object, no markdown, no extra text, in this exact shape:
{"phase": "assess|acquire|analyse|act", "csat": <int 0-10>, "credit_delta": <int -3 to 2>, "feedback": "<one or two sentence coaching feedback to the trainee, do not reveal the hidden root cause>", "root_cause_match": <true|false, only relevant if phase is act>}`;
}

function buildUserPrompt(problem, history, currentText, isActionFlag, creditRemaining, turnNumber) {
  const historyText = history.map(h => `Turn ${h.turn_number} [${h.phase}]: "${h.question_text}" -> CSAT ${h.csat_score}, credit_delta ${h.credit_delta}`).join('\n') || '(none yet)';
  return `HIDDEN CONTEXT (never reveal directly to trainee):
- Problem statement shown to trainee: "${problem.initial_statement}"
- Actual hidden root cause: "${problem.hidden_root_cause}"
- Relevant OSI layer: ${problem.osi_layer}

CONVERSATION HISTORY SO FAR:
${historyText}

CURRENT STATE:
- Turn number: ${turnNumber}
- Question credit remaining before this turn: ${creditRemaining}
- Trainee flagged this input as an ACTION attempt: ${isActionFlag}

TRAINEE'S CURRENT INPUT:
"${currentText}"

Classify and score this input now. Return only the JSON object.`;
}

function extractJSON(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in LLM response');
  return JSON.parse(match[0]);
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

  let judgment;
  let usedFallback = false;

  if (llmConfigRow) {
    try {
      const apiKey = decrypt(llmConfigRow.api_key_encrypted, process.env.LLM_KEY_ENCRYPTION_SECRET);
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(problem, history || [], questionText, isActionFlag, session.credit_remaining, session.turns_count + 1);
      const raw = await callLLM(
        { provider: llmConfigRow.provider, apiKey, customEndpoint: llmConfigRow.custom_endpoint, customModel: llmConfigRow.custom_model },
        systemPrompt, userPrompt
      );
      judgment = extractJSON(raw);
      if (typeof judgment.csat !== 'number' || typeof judgment.credit_delta !== 'number' || !judgment.phase) {
        throw new Error('Malformed LLM judgment');
      }
    } catch (err) {
      console.error('LLM judging failed, using fallback heuristic:', err.message);
      judgment = heuristicJudge(questionText, isActionFlag, problem.hidden_root_cause);
      usedFallback = true;
    }
  } else {
    judgment = heuristicJudge(questionText, isActionFlag, problem.hidden_root_cause);
    usedFallback = true;
  }

  const phase = judgment.phase;
  const csat = Math.max(0, Math.min(10, judgment.csat));
  const creditDelta = Math.max(-3, Math.min(2, judgment.credit_delta));
  const feedback = judgment.feedback + (usedFallback ? ' [Note: scored by fallback rules — AI judge unavailable]' : '');
  const rootCauseIdentified = phase === 'act' && !!judgment.root_cause_match;

  const creditRemaining = Math.max(0, session.credit_remaining + creditDelta);
  const turnsCount = session.turns_count + 1;
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
    ai_feedback: feedback, csat_score: csat, credit_delta: creditDelta, credit_remaining: creditRemaining
  });

  res.status(200).json({ phase, csat, creditDelta, creditRemaining, feedback, rootCauseIdentified, sessionEnded, turnsCount, questionLimit: problem.question_limit, usedFallback });
}
