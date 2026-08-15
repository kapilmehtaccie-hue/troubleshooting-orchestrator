export function generateSuggestions(logs, session, problem) {
  const suggestions = [];

  if (firstActTooEarly(logs)) {
    suggestions.push('You attempted an Act (solution/fix) before completing sufficient Assess and Acquire phases. Per the KTO-AI framework, ensure business impact, topology, and OSI-layer evidence are gathered before proposing an action — premature action risks destroying volatile diagnostic evidence.');
  }

  const lowCsatTurns = logs.filter(l => l.csat_score < 4);
  if (lowCsatTurns.length > 0) {
    suggestions.push(`${lowCsatTurns.length} of your inputs were vague or not clearly evidence-based (CSAT below 4). Ask specific, topology- or OSI-layer-grounded questions that narrow the problem space, rather than general or repeated ones.`);
  }

  if (session.evidence_destroyed) {
    suggestions.push('A blind action was taken during this session that may have destroyed volatile diagnostic evidence (e.g., logs, buffers, ARP tables) without resolving the issue. Always prioritize evidence preservation before restoration when the root cause is not yet confirmed.');
  }

  if (session.root_cause_identified) {
    suggestions.push('Root cause was correctly identified with supporting evidence — well done maintaining discipline through the Assess → Acquire → Analyse → Act sequence.');
  } else if (session.credit_remaining <= 0) {
    suggestions.push('Question Credit was exhausted before the root cause was found. Focus on high-value, non-redundant questions each turn to preserve customer trust and patience.');
  } else if (logs.length >= problem.question_limit) {
    suggestions.push('The question limit was reached before the root cause was confirmed. Practice narrowing the problem space more efficiently using OSI-layer mapping and Is/Is-Not analysis.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Solid, disciplined performance overall — continue practicing structured Assess → Acquire → Analyse → Act reasoning on more complex scenarios.');
  }

  return suggestions;
}

function firstActTooEarly(logs) {
  const firstAct = logs.find(l => l.phase === 'act');
  if (!firstAct) return false;
  const priorAcquire = logs.filter(l => l.turn_number < firstAct.turn_number && l.phase === 'acquire');
  return priorAcquire.length < 2;
}
