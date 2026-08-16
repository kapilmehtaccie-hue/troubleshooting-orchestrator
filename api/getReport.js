import { createClient } from '@supabase/supabase-js';
import { generateSuggestions } from './_lib/suggestions.js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const { data: session } = await supabaseAdmin.from('sessions').select('*, assignments(*)').eq('id', sessionId).single();
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).single();
  const isOrchestrator = profile?.role === 'orchestrator' && session.assignments.orchestrator_id === user.id;
  const isParticipant = session.assignments.participant_email.toLowerCase() === user.email.toLowerCase();
  if (!isOrchestrator && !isParticipant) return res.status(403).json({ error: 'Forbidden' });

  const { data: problem } = await supabaseAdmin.from('problems').select('title, initial_statement, osi_layer, question_limit, credit_start').eq('id', session.assignments.problem_id).single();
  const { data: logs } = await supabaseAdmin.from('question_log').select('*').eq('session_id', sessionId).order('turn_number');

  const csatScores = (logs || []).map(l => l.csat_score);
  const finalCsatAvg = csatScores.length ? (csatScores.reduce((a, b) => a + b, 0) / csatScores.length) : 0;
  const suggestions = generateSuggestions(logs || [], session, problem);

  const finalActTurn = (logs || []).slice().reverse().find(l => l.phase === 'act');
  const finalActEvidenceGrounded = finalActTurn ? finalActTurn.evidence_grounded : null;

  res.status(200).json({
    participantName: session.assignments.participant_name,
    participantEmail: session.assignments.participant_email,
    problemTitle: problem.title,
    problemStatement: problem.initial_statement,
    osiLayer: problem.osi_layer,
    finalCsatAvg: Math.round(finalCsatAvg * 10) / 10,
    creditRemaining: session.credit_remaining,
    creditStart: problem.credit_start,
    turnsUsed: session.turns_count,
    questionLimit: problem.question_limit,
    rootCauseIdentified: session.root_cause_identified,
    finalActEvidenceGrounded,
    evidenceDestroyed: session.evidence_destroyed,
    sessionEnded: !!session.ended_at,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    logs: logs || [],
    suggestions
  });
}
