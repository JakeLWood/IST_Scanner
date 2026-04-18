# IST Screener

**IST Screener** is an AI-powered investment deal-screening tool built for Catalyze Partners. It ingests deal documents (CIMs, teasers, one-pagers, pitch decks) and automatically produces a structured, scored screening analysis with a **PROCEED / FURTHER REVIEW / PASS** recommendation.

The system handles two deal tracks automatically:

- **Traditional PE** — lower middle market companies evaluated across financials, market, management, and strategic fit.
- **IP / Technology Commercialization** — Fortune 100 technology divestitures evaluated for technology readiness, IP defensibility, commercialization pathway, and orthogonal application potential.

**Tech stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Edge Functions) · Anthropic Claude

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Local development setup](#2-local-development-setup)
3. [Deploying to production](#3-deploying-to-production)
4. [Updating Claude prompts without code changes](#4-updating-claude-prompts-without-code-changes)
5. [Adding a new scoring dimension](#5-adding-a-new-scoring-dimension)
6. [Troubleshooting](#6-troubleshooting)
7. [Environment variables reference](#environment-variables-reference)
8. [Available scripts](#available-scripts)
9. [Project structure](#project-structure)

---

## 1. Architecture overview

The system is a four-layer pipeline (PRD §2.1). A document enters at layer 1 and emerges as a scored, stored screening report at layer 4.

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1 – Document Ingestion                                    │
│  app/upload/  ·  lib/extractTextFromFile.ts                      │
│  Accepts PDF (text + OCR), DOCX, PPTX, PNG/JPG, plain text.     │
│  Extracts raw text; computes a SHA-256 hash for deduplication.   │
└────────────────────────────┬─────────────────────────────────────┘
                             │ extracted text
┌────────────────────────────▼─────────────────────────────────────┐
│  Layer 2 – AI Analysis Engine                                    │
│  supabase/functions/classify-deal/   (deal-type classification)  │
│  supabase/functions/analyze-deal/    (full IST analysis)         │
│  lib/prompts/  ·  lib/marketResearch.ts                          │
│  Calls Anthropic Claude (claude-sonnet-4-5-20250929).            │
│  Returns a structured ISTAnalysis JSON (types/ist-analysis.ts).  │
│  API key is NEVER exposed to the browser.                        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ ISTAnalysis JSON
┌────────────────────────────▼─────────────────────────────────────┐
│  Layer 3 – Scoring & Decision Engine                             │
│  lib/scoringEngine.ts  ·  lib/actions/saveScreening.ts           │
│  Validates dimension weights (must sum to 100).                  │
│  Computes weighted composite score (1.0–10.0).                   │
│  Evaluates hard disqualifier rules.                              │
│  Produces PROCEED / FURTHER_REVIEW / PASS recommendation.        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ ScoringResult + saved record
┌────────────────────────────▼─────────────────────────────────────┐
│  Layer 4 – Web Application & Database                            │
│  app/  ·  Supabase (Postgres + Auth + Storage)                   │
│  Displays formatted IST report with dark-theme UI.               │
│  Stores every screening in the `screenings` table.               │
│  Admin UI at /admin: prompts, scoring weights, disqualifiers,    │
│  team management, API usage, deal outcomes.                      │
└──────────────────────────────────────────────────────────────────┘
```

### Key design decisions

| Concern | Decision |
|---------|----------|
| API key security | Claude API key stored only as a Supabase Edge Function secret; never in `.env.local` or the browser |
| Deal-type routing | `classify-deal` Edge Function runs first; result determines which system prompt `analyze-deal` uses |
| Scoring configurability | Weights, thresholds, and hard disqualifiers are stored in Postgres (`scoring_config`, `scoring_thresholds`, `disqualifiers`) and editable via the admin UI without code changes |
| Prompt versioning | Every save in the admin UI creates a new `system_prompts` row (with incremented `version`); old versions are retained and can be restored |
| RLS everywhere | Row-Level Security is enabled on every table; `api_usage_log` is write-accessible only to the service role |

### Data flow (happy path)

1. User uploads a document at `/upload`.
2. `lib/extractTextFromFile.ts` extracts text client-side (PDF/DOCX/PPTX/image).
3. The extracted text is sent to the `classify-deal` Edge Function → returns `traditional_pe` or `ip_technology`.
4. The `analyze-deal` Edge Function is called with the extracted text and the correct system prompt (loaded from the `system_prompts` table at runtime). It optionally fires a second Claude call for web-based market research (`lib/marketResearch.ts`).
5. The Edge Function returns an `ISTAnalysis` JSON to the browser.
6. The `saveScreening` server action (`lib/actions/saveScreening.ts`) calls `scoreAnalysis` with the current `scoring_config` weights, then writes the full record to Supabase.
7. The user is redirected to the screening results page.

---

## 2. Local development setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20 LTS or later | https://nodejs.org |
| **npm** | bundled with Node.js | — |
| **Supabase CLI** | latest | https://supabase.com/docs/guides/cli/getting-started |
| **Deno** | 1.x or 2.x | https://deno.com — required only to run Edge Functions locally |
| **Git** | any recent | https://git-scm.com |

Verify:

```bash
node -v        # v20.x.x or later
npm -v         # 10.x.x or later
supabase -v    # any version
deno -V        # any version
```

### Step 1 — Create external accounts

**Supabase** (database, auth, Edge Functions)

1. Sign up at https://supabase.com and create a new project.
2. In **Project Settings → API** copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` _(never expose this to the browser)_

**Anthropic** (Claude API)

1. Sign up at https://console.anthropic.com and create an API key.
2. Copy the key → `ANTHROPIC_API_KEY` _(never expose this to the browser)_

**Resend** (optional — email sharing and inbound email intake)

1. Sign up at https://resend.com and create an API key.
2. Copy the key → `RESEND_API_KEY`
3. Verify a sending domain and set `RESEND_FROM_EMAIL`.
4. If using the inbound email intake feature, create a webhook and copy the signing secret → `RESEND_WEBHOOK_SECRET`.

### Step 2 — Clone and install

```bash
git clone https://github.com/JakeLWood/IST_Scanner.git
cd IST_Scanner
npm install
```

### Step 3 — Configure environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in all values. Minimum required for local development:

```env
# Supabase (from Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic — only needed if calling AI locally via the API route, not Edge Functions
ANTHROPIC_API_KEY=sk-ant-your-key

# App URL (used in email links)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Email (optional — omit to disable email features)
RESEND_API_KEY=re_your_key
RESEND_FROM_EMAIL=IST Screener <noreply@yourdomain.com>
RESEND_WEBHOOK_SECRET=whsec_your_secret
ADMIN_NOTIFICATION_EMAIL=admin@yourfirm.com
```

> The full list is documented in [`.env.local.example`](.env.local.example) and in the [Environment variables reference](#environment-variables-reference) section below.

### Step 4 — Apply database migrations

The complete schema (tables, indexes, RLS policies) and seed data live in `supabase/migrations/`. Push them to your Supabase project in one command:

```bash
# Link the CLI to your project (run once; uses the project-ref from your dashboard URL)
supabase link --project-ref your-project-ref

# Apply all migrations
supabase db push
```

This creates all tables (`screenings`, `system_prompts`, `scoring_config`, `disqualifiers`, etc.), enables RLS, and seeds the default Claude prompts and hard disqualifier rules.

### Step 5 — Deploy Edge Functions

The AI pipeline runs in Supabase Edge Functions (Deno runtime). Set the required secrets first so the functions can call the Anthropic API:

```bash
# Inject secrets into the Edge Function runtime (not stored in any file)
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-api-key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Deploy all three functions
supabase functions deploy analyze-deal
supabase functions deploy classify-deal
supabase functions deploy test-prompt
```

To test Edge Functions locally before deploying, run `supabase functions serve` in a separate terminal. This starts a local Deno server that proxies to your remote database.

### Step 6 — Run the dev server

```bash
npm run dev
```

Open **http://localhost:3000**. You will be redirected to the login page. Sign up with an email address; Supabase sends a magic-link confirmation email. The first user created is automatically given the `admin` role if you seed an admin record, otherwise update the role in the Supabase dashboard: **Table Editor → users → set role to `admin`**.

### Step 7 — Run tests

```bash
npm test              # single run (Vitest)
npm run test:watch    # watch mode
```

---

## 3. Deploying to production

### Supabase (database + Edge Functions)

The Supabase project is the same one you created during local setup. For production:

1. **Migrations** — run `supabase db push` after each schema change to keep the production database in sync with `supabase/migrations/`.
2. **Secrets** — confirm that `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set as Edge Function secrets:
   ```bash
   supabase secrets list   # verify secrets are present
   ```
3. **Edge Functions** — re-deploy after any code change:
   ```bash
   supabase functions deploy analyze-deal
   supabase functions deploy classify-deal
   supabase functions deploy test-prompt
   ```

### Vercel (Next.js frontend)

1. Push the repository to GitHub (already done if you cloned from `JakeLWood/IST_Scanner`).
2. Go to **https://vercel.com/new** and import the repository.
3. In **Settings → Environment Variables** add every variable from `.env.local.example` except `NEXT_PUBLIC_APP_URL` — Vercel sets that automatically from your deployment URL. At minimum:

   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service-role key |
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `RESEND_API_KEY` | your Resend key (if using email) |
   | `RESEND_FROM_EMAIL` | verified sender address |
   | `RESEND_WEBHOOK_SECRET` | Resend inbound webhook secret |
   | `ADMIN_NOTIFICATION_EMAIL` | admin notification address |

4. Click **Deploy**. Vercel runs `npm run build` and serves the result at your deployment URL.
5. Update `NEXT_PUBLIC_APP_URL` in Vercel to your production URL (e.g. `https://ist-screener.vercel.app`). This is used to generate correct links in notification emails.

### Verifying the production deployment

After deploying:

- Visit `/login` — confirm you can sign in.
- Visit `/upload` — upload a small test document (even a `.txt` file with "Company X, $5M revenue").
- Confirm the screening result page renders with a score and recommendation.
- Visit `/admin/usage` — confirm API usage is being logged.

---

## 4. Updating Claude prompts without code changes

The prompts that Claude uses for analysis are stored in the `system_prompts` database table, not hard-coded. Admins can edit them at runtime through the admin UI.

### system_prompts table structure

| Column | Description |
|--------|-------------|
| `id` | UUID primary key |
| `name` | Human-readable label (e.g. `"PE System Prompt"`) |
| `prompt_text` | The full prompt text sent to Claude |
| `prompt_type` | Enum: `system`, `analysis_pe`, `analysis_ip`, `classification`, `summary` |
| `track` | Enum: `traditional_pe`, `ip_technology`, or `NULL` (applies to both) |
| `is_active` | Only the active version is used at runtime |
| `version` | Integer; incremented on every save — old versions are never deleted |
| `created_by` | FK to the admin user who saved this version |

### How to edit a prompt

1. Sign in as a user with `role = admin`.
2. Navigate to **Admin → Prompts** (`/admin/prompts`).
3. Select the track tab: **Traditional PE** or **IP / Technology**.
4. The large textarea shows the currently active prompt. Edit it directly — the textarea accepts plain text.
5. Click **Test Prompt**: paste any snippet of deal text and click **Run**. The server calls the `test-prompt` Edge Function and displays the raw JSON Claude returns. Use this to validate your changes before saving.
6. When satisfied, click **Save**. The server action `saveSystemPrompt` creates a new row in `system_prompts` with an incremented `version` number and sets `is_active = true` for the new row (and `is_active = false` for all previous versions of the same track).
7. The **Version History** panel shows all past versions. To roll back, click **Restore** next to any version — this re-activates that row.

> **How the runtime uses the prompt:** The `analyze-deal` Edge Function queries `system_prompts` for the row where `track = <deal_type>` and `is_active = true`, then injects `prompt_text` as the `system` message in the Anthropic API call. Changes take effect on the next screening — no deployment required.

### Tips for prompt changes

- Keep the JSON output schema instruction at the end of the prompt. The scoring engine (`lib/scoringEngine.ts`) and the `ISTAnalysis` type (`types/ist-analysis.ts`) expect a specific shape; prompt changes that alter the schema will break parsing.
- Use the **Test Prompt** panel against a realistic deal snippet before going live. Look for missing keys or unexpected null values in the JSON output.
- The `classification` prompt (used by `classify-deal`) is a separate prompt type. Edit it via the same UI by selecting the `classification` prompt type if you need to adjust deal-type detection logic.

---

## 5. Adding a new scoring dimension

This requires changes in five places. Follow the steps in order to avoid type errors.

### Step 1 — Update the TypeScript types

**`types/ist-analysis.ts`** — add the new section interface and add it to `ISTAnalysis`:

```typescript
// New section interface
export interface MyNewDimension extends ISTSection {
  sectionName: "My New Dimension";
}

// In ISTAnalysis, add the new field:
export interface ISTAnalysis {
  // ... existing fields ...
  myNewDimension: MyNewDimension;
}
```

**`lib/scoringEngine.ts`** — add the new key to `ISTDimension` and `DEFAULT_WEIGHTS`:

```typescript
export type ISTDimension =
  | "companyOverview"
  | "marketOpportunity"
  | "financialProfile"
  | "managementTeam"
  | "investmentThesis"
  | "riskAssessment"
  | "dealDynamics"
  | "myNewDimension"; // ← add here

export const DEFAULT_WEIGHTS: DimensionWeights = {
  companyOverview:   15,
  marketOpportunity: 20,
  financialProfile:  20,
  managementTeam:    10, // ← adjust existing weights so they still sum to 100
  investmentThesis:  15,
  riskAssessment:    10,
  dealDynamics:       5,
  myNewDimension:     5, // ← add here; must sum to 100 with others
};
```

Also add the new key to the `DIMENSIONS` array and the `dimensionScores` object inside `scoreAnalysis`:

```typescript
const DIMENSIONS: ISTDimension[] = [
  // ... existing dimensions ...
  "myNewDimension",
];

// inside scoreAnalysis():
const dimensionScores: Record<ISTDimension, number> = {
  // ... existing entries ...
  myNewDimension: analysis.myNewDimension.score,
};
```

### Step 2 — Add a database migration for scoring_config

Create a new file in `supabase/migrations/` with a timestamp prefix:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_my_new_dimension.sql
INSERT INTO public.scoring_config (track, dimension, weight)
VALUES
  ('traditional_pe', 'myNewDimension', 5),
  ('ip_technology',  'myNewDimension', 5);

-- Adjust existing rows so weights still sum to 100 per track:
UPDATE public.scoring_config
SET weight = weight - 2.5
WHERE track = 'traditional_pe' AND dimension IN ('managementTeam', 'dealDynamics');
```

Apply the migration:

```bash
supabase db push
```

### Step 3 — Update the Claude prompt

Navigate to **Admin → Prompts** and add a section to the prompt that instructs Claude to return the new dimension. For example, add to the analysis prompt:

```
myNewDimension: {
  sectionName: "My New Dimension",
  score: <1-10>,
  commentary: "<2-3 sentence narrative>",
  keyFindings: ["<finding 1>", "<finding 2>"]
}
```

Save the updated prompt (this creates a new version automatically).

### Step 4 — Update the scoring admin UI

If you want the new dimension weight to be editable in the admin UI without code changes, the `scoring_config` row you inserted in Step 2 will automatically appear in **Admin → Settings → Scoring Weights** — no UI code change is required, because the settings page reads all dimensions dynamically from the database.

If you want custom display labels, add an entry to the dimension label map in `app/admin/settings/AdminSettingsClient.tsx`.

### Step 5 — Update the Edge Function

The `analyze-deal` Edge Function (`supabase/functions/analyze-deal/index.ts`) contains an inline TypeScript copy of the `ISTAnalysis` interface. Add the new dimension there too so the function can correctly parse and return it:

```typescript
// In supabase/functions/analyze-deal/index.ts
interface ISTAnalysis {
  // ... existing fields ...
  myNewDimension: ISTSectionWithName;
}
```

Re-deploy:

```bash
supabase functions deploy analyze-deal
```

### Summary checklist

- [ ] `types/ist-analysis.ts` — new interface + field on `ISTAnalysis`
- [ ] `lib/scoringEngine.ts` — new key in `ISTDimension`, `DIMENSIONS`, `DEFAULT_WEIGHTS`, `dimensionScores`
- [ ] `supabase/migrations/` — new migration inserting `scoring_config` rows
- [ ] Admin UI → Prompts — updated prompt instructing Claude to return the new section
- [ ] `supabase/functions/analyze-deal/index.ts` — inline type updated + function re-deployed

---

## 6. Troubleshooting

### Issue 1 — "Invalid JWT" or 401 errors from Supabase

**Symptom:** API calls return `401 Unauthorized` or `"Invalid JWT"` in the browser console.

**Causes and fixes:**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` is wrong. Verify it matches the **anon / public** key in Supabase **Project Settings → API**.
- The user's session has expired. Sign out and sign in again.
- The Edge Function is receiving the wrong JWT. Make sure `callEdgeFunction` in `lib/api/edgeFunctions.ts` is reading the session access token from `supabase.auth.getSession()` and attaching it in the `Authorization: Bearer <token>` header.

### Issue 2 — Edge Function returns 500 / "FunctionsFetchError"

**Symptom:** The upload page spins indefinitely, then shows a generic error. The browser console shows a `FunctionsFetchError` or a 500 status.

**Causes and fixes:**
- `ANTHROPIC_API_KEY` secret is missing or wrong in the Edge Function runtime. Run `supabase secrets list` to verify it is set. Re-set it with `supabase secrets set ANTHROPIC_API_KEY=...` and re-deploy the function.
- The Edge Function was not deployed after the last code change. Run `supabase functions deploy analyze-deal`.
- Deno import errors. Run `supabase functions serve analyze-deal --debug` locally to see the full stack trace.
- Rate limit exceeded on the Anthropic API. Check your usage at https://console.anthropic.com.

### Issue 3 — Scoring weights do not sum to 100

**Symptom:** `scoreAnalysis` throws `"Dimension weights must sum to 100; current sum is X"`.

**Causes and fixes:**
- A `scoring_config` migration adjusted some weights but not others. Run this query in the Supabase SQL editor to inspect the current state:
  ```sql
  SELECT track, SUM(weight) AS total FROM scoring_config GROUP BY track;
  ```
- Create a new migration that corrects the weights, then run `supabase db push`.
- The `DEFAULT_WEIGHTS` constant in `lib/scoringEngine.ts` does not sum to 100. Verify and correct it.

### Issue 4 — Claude returns unparseable JSON or missing fields

**Symptom:** The results page shows a blank or partial analysis. The browser or server logs show a JSON parse error, or a TypeScript error about a missing property on `ISTAnalysis`.

**Causes and fixes:**
- The prompt was edited to add or rename a section without updating `types/ist-analysis.ts` and `lib/scoringEngine.ts`. Ensure all three are in sync.
- Claude occasionally returns a response wrapped in a markdown code fence (` ```json ... ``` `). The `analyze-deal` Edge Function strips these, but if you have a custom integration confirm the stripping logic is present.
- Use the **Test Prompt** panel in **Admin → Prompts** to inspect the raw JSON Claude returns and compare it against `ISTAnalysis` in `types/ist-analysis.ts`.
- If the schema mismatch is in production, restore the previous prompt version from the **Version History** panel while you fix the types.

### Issue 5 — "new row violates row-level security policy" when saving a screening

**Symptom:** `saveScreening` fails with a Postgres RLS error. The screening is not saved.

**Causes and fixes:**
- The user is not authenticated at the time of the server action call. Confirm `supabase.auth.getUser()` returns a valid user in `lib/actions/saveScreening.ts`.
- RLS policies were not applied (migrations not pushed). Run `supabase db push` and verify the policies exist in **Authentication → Policies**.
- A new table was added without corresponding RLS policies. Every table must have `ENABLE ROW LEVEL SECURITY` and at least one policy. See `supabase/migrations/20260307000001_rls_policies.sql` as the reference pattern.
- `api_usage_log` INSERT attempts from client code will always fail — writes to that table are intentionally restricted to the service role (PRD §2.4). Use a server action or Edge Function for any `api_usage_log` inserts.

---

## Environment variables reference

| Variable | Where it lives | Required | Description |
|----------|---------------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Yes | Supabase project URL — safe to expose to the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Yes | Supabase anon/public key — safe to expose to the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` + Edge Function secret | Yes | Service-role key — bypasses RLS; **never expose to browser** |
| `ANTHROPIC_API_KEY` | Edge Function secret | Yes | Anthropic Claude API key; **never expose to browser** |
| `RESEND_API_KEY` | `.env.local` | Email features | Resend API key for outbound email (share results, notifications) |
| `RESEND_FROM_EMAIL` | `.env.local` | Email features | Verified sender address (e.g. `IST Screener <noreply@yourdomain.com>`) |
| `NEXT_PUBLIC_APP_URL` | `.env.local` | Yes | Public base URL — used to build links in emails (`http://localhost:3000` locally) |
| `RESEND_WEBHOOK_SECRET` | `.env.local` | Inbound email | Webhook signing secret from Resend inbound settings |
| `ADMIN_NOTIFICATION_EMAIL` | `.env.local` | Inbound email | Comma-separated admin emails notified of unrecognised inbound senders |

---

## Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js development server on port 3000 |
| `npm run build` | Build the app for production |
| `npm start` | Start the production server (requires `npm run build` first) |
| `npm run lint` | Run ESLint across the project |
| `npm test` | Run the full test suite with Vitest |
| `npm run test:watch` | Run Vitest in watch mode (re-runs on file save) |
| `npm run validate:scoring` | Run the scoring calibration validation script |

---

## Project structure

```
.
├── app/                        # Next.js App Router pages and layouts
│   ├── admin/                  # Admin-only pages
│   │   ├── disqualifiers/      # Hard disqualifier rule management
│   │   ├── outcomes/           # Decision outcome tracking (PRD §8.4)
│   │   ├── prompts/            # Claude prompt editor (PromptsClient.tsx)
│   │   ├── settings/           # Scoring weights and thresholds
│   │   ├── team/               # User / role management
│   │   └── usage/              # API usage log and cost tracking
│   ├── api/
│   │   └── email-intake/       # Resend inbound email webhook (PRD §8.2)
│   ├── compare/                # Side-by-side deal comparison page
│   ├── deals/[id]/             # Deal flow detail page (PRD §8.1)
│   ├── login/                  # Auth page
│   ├── screenings/             # Screening history list + results detail
│   └── upload/                 # Document upload and analysis trigger
├── lib/
│   ├── actions/                # Next.js Server Actions (saveScreening, etc.)
│   ├── ai/                     # Node.js AI helpers (analyzeDocument.ts)
│   ├── api/                    # Edge Function client (edgeFunctions.ts)
│   ├── email/                  # Email builder helpers
│   ├── export/                 # Excel export (SheetJS) and PDF export
│   ├── prompts/                # Hardcoded Claude prompt templates (fallback)
│   ├── scoringEngine.ts        # Weighted composite score computation
│   └── supabase/               # Supabase client factories (browser + server)
├── supabase/
│   ├── functions/
│   │   ├── analyze-deal/       # Main IST analysis Edge Function (Deno)
│   │   ├── classify-deal/      # Deal-type classification Edge Function
│   │   └── test-prompt/        # Prompt testing Edge Function (admin UI)
│   └── migrations/             # Timestamped SQL migration files
├── types/
│   ├── ist-analysis.ts         # ISTAnalysis interface (Claude output schema)
│   └── ist.ts                  # Supporting types (ISTDimensionScore, etc.)
├── __tests__/                  # Vitest test suite
├── .env.local.example          # Environment variable template
└── docs/
    └── IST_Screener_PRD.md     # Full product requirements document
```

---

## Learn more

- [Next.js documentation](https://nextjs.org/docs)
- [Supabase documentation](https://supabase.com/docs)
- [Supabase CLI reference](https://supabase.com/docs/reference/cli/introduction)
- [Anthropic API documentation](https://docs.anthropic.com)
- [Product Requirements Document](docs/IST_Screener_PRD.md)
