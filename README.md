# AI Orchestrator for Troubleshooting Skills Training

An open-source, self-deployable training tool based on the **KTO-AI Framework** (Kepner-Tregoe, Topology awareness, OSI-layer mapping) and the **4A's Loop** (Assess → Acquire → Analyse → Act), as presented in:

> Kapil Mehta, Prashant Sumanprasad Bhadoria, Jaypal Baviskar. *An AI Orchestrator Model for Troubleshooting Skills Training in Network Engineering*. SIGCOMM Education Workshop 2026. [https://a4ne-workshop.github.io/papers/a4ne26-paper6.pdf](https://a4ne-workshop.github.io/papers/a4ne26-paper6.pdf)

This tool lets an **Orchestrator** assign realistic, vague network problem statements to **Participants**, who must ask disciplined diagnostic questions (Assess/Acquire) before proposing a fix (Act). An AI agent pipeline plays the role of the customer/environment and a second AI agent scores each turn on **CSAT** and **Question Credit**, mirroring real customer trust dynamics. At the end, participants get a PDF report with scores and framework-aligned coaching suggestions.

---

## Who Needs to Do What

| Role | Setup Required? | What They Do |
|---|---|---|
| **Human Orchestrator** | ✅ Yes — one-time deployment (below) | Deploys their own free instance, configures an LLM API key, assigns problems to participants, reviews everyone's reports/scores |
| **Participant** | ❌ None | Clicks the link the orchestrator gives them, signs in with Google, works through the exercise, downloads their own PDF report |

**Important:** This is a fork-and-deploy model. There is no shared/central server. Every orchestrator runs their own free, isolated copy — your data, participants, and API key are never shared with anyone else who forks this repo.

---

## Architecture

| Layer | Technology | Notes |
|---|---|---|
| Hosting (frontend + serverless functions) | Vercel | Free tier, no credit card required |
| Auth + Database | Supabase | Free tier, Postgres + Google OAuth |
| AI Agents | Orchestrator's own LLM API key (OpenAI / Anthropic / Gemini / any OpenAI-compatible custom endpoint) | Entered once in the dashboard, stored encrypted |
| PDF Reports | jsPDF (client-side) | No backend cost |

⚠️ **Note:** This tool currently requires Vercel + Supabase specifically (their SDKs/conventions are used directly in the code). Both offer generous free tiers suitable for workshop-scale use.

---

## One-Time Setup (Human Orchestrators Only)

### Step 1 — Fork This Repository
Click **Fork** on GitHub to create your own copy.

### Step 2 — Create a Vercel Account
1. Go to [vercel.com](https://vercel.com) → Sign up with **"Continue with GitHub"**
2. Click **Add New Project** → import your forked repo
3. Don't deploy yet — you'll add environment variables first (Step 6)

### Step 3 — Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) → Sign up with **"Continue with GitHub"**
2. Click **New Project** → name it, set a database password (save it), choose a region → Create
3. Go to **Settings → Data API** → copy the **Project URL**
4. Go to **Settings → API Keys** → copy the **Publishable key** and **Secret key**

### Step 4 — Set Up the Database
1. In Supabase, go to **SQL Editor → New Query**
2. Run the contents of `supabase/schema.sql` from this repo
3. Run the contents of `supabase/seed_problems.sql` to load the 30 default problem statements
4. Run the contents of `supabase/case_files.sql` to load the detailed case files used by the AI Simulator Agent

### Step 5 — Enable Google Login
1. In Supabase: **Authentication → Providers → Google** → enable it
2. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a new project
3. **APIs & Services → OAuth consent screen** → choose External → fill minimal fields → Save
4. **Credentials → Create Credentials → OAuth Client ID** → Application type: Web application
5. Under **Authorized redirect URIs**, add the callback URL shown on Supabase's Google provider screen (e.g., `https://YOUR_PROJECT.supabase.co/auth/v1/callback`)
6. Under **Authorized JavaScript origins**, add your future Vercel URL (e.g., `https://your-app.vercel.app`)
7. Copy the **Client ID** and **Client Secret** into Supabase's Google provider fields → Save

### Step 6 — Add Environment Variables in Vercel
Go to **Vercel → your project → Settings → Environment Variables** and add:

| Key | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase Project URL (no trailing path) |
| `SUPABASE_ANON_KEY` | Your Supabase Publishable key |
| `SUPABASE_SERVICE_KEY` | Your Supabase Secret key |
| `LLM_KEY_ENCRYPTION_SECRET` | Any random 32-character string (generate at [randomkeygen.com](https://randomkeygen.com)) |

Then trigger a deploy (**Deployments → Redeploy**, or push any commit).

### Step 7 — Configure Supabase Redirect URLs
Once you have your live Vercel URL:
1. Supabase → **Authentication → URL Configuration**
2. Set **Site URL** to your Vercel URL exactly (e.g., `https://your-app.vercel.app`)
3. Add the same URL under **Redirect URLs**

### Step 8 — Turn Off Vercel Deployment Protection
Vercel → **Settings → Deployment Protection** → set to **Off** (otherwise Vercel's own login screen blocks access before your app's Google login even loads).

### Step 9 — Get an LLM API Key
Pick one provider and generate a free/paid API key:
- **OpenAI:** [platform.openai.com](https://platform.openai.com)
- **Anthropic (Claude):** [console.anthropic.com](https://console.anthropic.com)
- **Google Gemini (has a free tier):** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Custom/self-hosted (OpenAI-compatible):** any endpoint you control

You'll enter this directly in the app (next section) — it is encrypted before being stored, and only ever decrypted server-side at scoring time.

---

## Using the App

### First Login
1. Visit your Vercel URL, sign in with Google
2. On first login, choose **"Become Orchestrator"**

### Orchestrator Dashboard
1. **Configure LLM Judge** — pick a provider, enter the exact model name (see links in-app for current model names, since providers rename these often), enter your API key, click **Test Connection**, then **Save**
2. **Select Problem to Assign** — choose from the 30 built-in problems (or any you've added — see below)
3. **Add Participants** — single entry, bulk paste (`Name, Email` per line), or upload a `.csv`/`.txt` file
4. **Assign Problem & Generate Link** — creates a unique link per participant. Copy and share it via any channel (email, Slack, Teams) — the app does not auto-send email
5. **Participant Reports & Scores** — view every participant's CSAT average, question credit, turns used, and whether they found the root cause; download any completed report as PDF

### Participant Experience
1. Open the link the orchestrator shared
2. Sign in with the **exact Google account** the orchestrator entered — access is granted only if the emails match
3. Read the (deliberately vague) problem statement
4. Ask questions or propose actions — check the "This is an Action attempt" box before proposing a fix
5. An AI **Simulator Agent** responds in-character based on a detailed hidden case file, and an AI **Judge Agent** scores each turn on CSAT (0–10) and Question Credit (finite budget)
6. The exercise ends when: the root cause is correctly identified, Question Credit reaches 0, or the question limit is reached
7. Download your PDF report — includes your full turn log, final scores, and framework-aligned coaching suggestions

---

## Customizing Behavior Without Touching Code

This tool uses an **agentic architecture** with behavior defined in plain-language **skill files**, not hardcoded logic:

| File | Controls |
|---|---|
| `skills/simulator-agent.md` | How the AI plays the customer/environment — tone, strictness about not over-answering, how it handles vague questions |
| `skills/judge-agent.md` | Scoring rubric — how CSAT and Question Credit are calculated per phase |

**To change how the AI behaves, edit these Markdown files directly** — no JavaScript knowledge required. For example, to make the Simulator even stricter about not volunteering information, add more worked examples to `simulator-agent.md`.

---

## Adding or Editing Problem Statements

Problems live in the `problems` table in Supabase, with two fields per problem:
- `initial_statement` — the vague, user-facing symptom description
- `case_file` — a detailed, structured ground-truth document (environment, timeline, symptoms by dimension, action outcomes) that the Simulator Agent uses to answer questions consistently

The 30 default problems ship via `supabase/seed_problems.sql`. Six have full detailed `case_file` entries (`supabase/case_files.sql`); the rest currently fall back to a shorter `hidden_root_cause` field, which works but produces less rich conversations. Orchestrators are encouraged to write their own case files for other problems (or entirely new ones) following the same structure — see the six existing examples as a template.

---

## Security Notes

- LLM API keys are encrypted (AES-256) before storage and only decrypted server-side, in-memory, at scoring time — never exposed to the browser.
- Participant access is enforced by exact Google-account email match against the orchestrator-assigned email, checked server-side via Supabase Row Level Security policies.
- Each orchestrator can only see their own participants' data (Row Level Security scoped by `orchestrator_id`).
- The hidden root cause / case file is never sent to the browser — only a sanitized public view (`problems_public`) is client-accessible.

---

## Future Work / Known Limitations

- **Provider lock-in:** currently requires Vercel + Supabase specifically. Supabase is open-source and self-hostable (same code, different deployment target).
- **LLM cost/latency:** each participant turn makes two LLM calls (Simulator + Judge agents). A retry-with-backoff mechanism handles transient provider capacity errors; a rule-based fallback engages if the LLM is fully unavailable, consistent with the paper's Section 8 discussion of hallucination/reliability safeguards.
- **Case file coverage:** only 6 of 30 default problems currently have full detailed case files; the rest use a shorter fallback context.

---

## Disclaimer

This is an independent, personal open-source project shared for academic and educational purposes. It is **not an official Cisco Systems product**, and is **not supported, endorsed, warranted, or maintained by Cisco Systems, Inc.** Any reference to Cisco in accompanying academic publications reflects the author's employer affiliation at the time of writing and does not imply institutional endorsement of this specific software artifact. Use of the Cisco name, logo, or trademarks is not granted or implied by sharing this repository.

This software is provided **"as is,"** without warranty of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. Use of this tool, including any costs incurred from third-party services (Vercel, Supabase, LLM providers) configured by the deploying orchestrator, is entirely at the deploying party's own risk and discretion.

---

## Citation

If you use or adapt this artifact, please cite:
