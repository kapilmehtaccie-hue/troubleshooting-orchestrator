# Orchestrator Workflow (Reference)

Per participant turn, the Orchestrator (api/judgeQuestion.js) executes this pipeline:

1. Load Simulator Agent skill + Judge Agent skill from /skills.
2. Call Simulator Agent with: case file, conversation history, current input -> get simulated_answer.
3. Call Judge Agent with: hidden root cause, conversation history, current input, simulated_answer -> get phase/csat/credit_delta/feedback/root_cause_match.
4. Persist both outputs to question_log. Update session credit/turns/phase.
5. End session if: root cause identified, credit <= 0, or turn limit reached.

To change behavior:
- Edit simulator-agent.md to change how the environment "talks."
- Edit judge-agent.md to change scoring strictness/rubric.
- No JavaScript changes required for either.
