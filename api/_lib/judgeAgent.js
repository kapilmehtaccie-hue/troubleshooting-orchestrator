import { callLLM } from './llmProviders.js';

function buildJudgeUserPrompt(problem, history, currentText, isActionFlag, simulatedAnswer, creditRemaining, turnNumber) {
  const historyText = history.map(h =>
    `Turn ${h.turn_number} [${h.phase}]: Trainee asked "${h.question_text}" -> Simulator answered: "${h.simulated_answer ?? ''}" (Scored: CSAT ${h.csat_score}, credit_delta ${h.credit_delta})`
  ).join('\n') || '(none yet)';

  return `HIDDEN CONTEXT:
- Original problem statement shown to trainee at the start: "${problem.initial_statement}"
- Actual hidden root cause: "${problem.hidden_root_cause}"
- Relevant OSI layer: ${problem.osi_layer}

FULL CONVERSATION HISTORY SO FAR (check this AND the original problem statement above for redundancy):
${historyText}

CURRENT STATE:
- Turn number: ${turnNumber}
- Question credit remaining before this turn: ${creditRemaining}
- Trainee flagged this input as an ACTION attempt: ${isActionFlag}

TRAINEE'S CURRENT INPUT:
"${currentText}"

SIMULATOR'S RESPONSE TO THE TRAINEE (what the trainee just learned, if anything new):
"${simulatedAnswer}"

First, check: does the trainee's input ask for information already present in the original problem statement or an earlier turn above? Then classify and score accordingly per your skill instructions. Return only the JSON object.`;
}

export async function runJudgeAgent(llmConfig, skillText, problem, history, currentText, isActionFlag, simulatedAnswer, creditRemaining, turnNumber) {
  const userPrompt = buildJudgeUserPrompt(problem, history, currentText, isActionFlag, simulatedAnswer, creditRemaining, turnNumber);
  const raw = await callLLM(llmConfig, skillText, userPrompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Judge agent: no JSON found in response');
  const parsed = JSON.parse(match[0]);
  if (typeof parsed.csat !== 'number' || typeof parsed.credit_delta !== 'number' || !parsed.phase) {
    throw new Error('Judge agent: malformed judgment');
  }
  return parsed;
}
