import { callLLM } from './llmProviders.js';

function buildSimulatorUserPrompt(problem, history, currentText, isActionFlag, turnNumber) {
  const historyText = history.map(h =>
    `Turn ${h.turn_number} — Trainee: "${h.question_text}" | You responded: "${h.simulated_answer ?? ''}"`
  ).join('\n') || '(none yet — this is the first turn)';

  return `CASE FILE (ground truth — never reveal root cause directly, only what's specifically asked or observably relevant):
${problem.case_file || problem.hidden_root_cause}

PROBLEM STATEMENT SHOWN TO TRAINEE: "${problem.initial_statement}"

CONVERSATION SO FAR:
${historyText}

CURRENT TURN (#${turnNumber}):
Trainee flagged this as an ACTION attempt: ${isActionFlag}
Trainee's input: "${currentText}"

Respond ONLY with JSON: {"simulated_answer": "<your in-character response, 1-4 sentences>"}`;
}

export async function runSimulatorAgent(llmConfig, skillText, problem, history, currentText, isActionFlag, turnNumber) {
  const userPrompt = buildSimulatorUserPrompt(problem, history, currentText, isActionFlag, turnNumber);
  const raw = await callLLM(llmConfig, skillText, userPrompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Simulator agent: no JSON found in response');
  const parsed = JSON.parse(match[0]);
  if (!parsed.simulated_answer) throw new Error('Simulator agent: missing simulated_answer field');
  return parsed.simulated_answer;
}
