# Problem Statement Upload Format

Upload a `.csv`, `.txt` (comma-separated), or `.xlsx` file with these columns, in this exact order.
First row must be a header row (it will be skipped automatically).

| Column | Required? | Description |
|---|---|---|
| title | Yes | Short name for the problem (shown in orchestrator dropdown) |
| initial_statement | Yes | The vague, user-facing symptom description shown to the participant |
| hidden_root_cause | Yes | The actual root cause (never shown to participant; used for fallback/matching) |
| osi_layer | No | e.g., L1, L2, L3, L7 (defaults to blank if omitted) |
| case_file | No | Detailed ground-truth narrative for the AI Simulator Agent (environment, timeline, symptoms, action outcomes). Strongly recommended for richer conversations — see the 6 example case files in this repo for the expected structure. If omitted, the Simulator will rely only on hidden_root_cause (less rich). |
| credit_start | No | Starting Question Credit (defaults to 10) |
| question_limit | No | Max turns allowed (defaults to 14) |

## Example Row (CSV)
