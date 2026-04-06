# IST Screener

**IST Screener** is an AI-powered investment deal-screening tool built for Catalyze Partners. It ingests deal documents (CIMs, teasers, one-pagers, pitch decks) and automatically produces a structured, scored screening analysis with a **PROCEED / FURTHER REVIEW / PASS** recommendation.

The system handles two deal tracks automatically:

- **Traditional PE** — lower middle market companies evaluated across financials, market, management, and strategic fit.
- **IP / Technology Commercialization** — Fortune 100 technology divestitures evaluated for technology readiness, IP defensibility, commercialization pathway, and orthogonal application potential.

**Tech stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Edge Functions) · Anthropic Claude

---

## Prerequisites

Install the following tools before proceeding:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | 20 LTS or later | https://nodejs.org |
| **npm** | bundled with Node.js | — |
| **Supabase CLI** | latest | https://supabase.com/docs/guides/cli/getting-started |
| **Deno** | 1.x or 2.x | https://deno.com (required to run Edge Functions locally) |
| **Git** | any recent | https://git-scm.com |

### Verify installations

```bash
node -v        # should print v20.x.x or later
npm -v         # should print 10.x.x or later
supabase -v    # should print a version number
deno -V        # should print a version number
```

---

## Account sign-ups

You need accounts on two services. Both have free tiers that are sufficient for development.

### 1. Supabase

Supabase hosts the database, authentication, and Edge Function runtime.

1. Go to **https://supabase.com** and click **Start your project**.
2. Sign up with GitHub (recommended) or email.
3. Once logged in, click **New project**.
4. Choose an organisation (or create one), give the project a name (e.g. `ist-screener`), set a strong database password, and pick a region close to you.
5. Wait for the project to be provisioned (~1 minute).
6. Go to **Project Settings → API** and copy:
   - **Project URL** → you will use this as `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → you will use this as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → you will use this as `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — never expose it to the browser)

### 2. Anthropic (Claude API)

The AI analysis engine calls Claude via the Anthropic API.

1. Go to **https://console.anthropic.com** and sign up.
2. After logging in, go to **API Keys** and click **Create Key**.
3. Copy the key → you will use this as `ANTHROPIC_API_KEY`.
4. Add a credit card and enable billing, or use any free credits provided. The app uses `claude-sonnet-4-5-20250929`.

> **Security:** The Anthropic API key is **never** sent to the browser. It lives only in the Supabase Edge Function runtime as a secret (see [Deploy Edge Functions](#5-deploy-edge-functions) below).

---

## Local setup

### 1. Clone the repository

```bash
git clone https://github.com/JakeLWood/IST_Scanner.git
cd IST_Scanner
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in the values you copied from Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> The `service_role` key and `ANTHROPIC_API_KEY` are **not** stored in `.env.local` — they are injected directly into Supabase Edge Functions as secrets (see below).

### 4. Apply database migrations

The schema and Row-Level Security (RLS) policies are defined as SQL migration files in `supabase/migrations/`. Push them to your Supabase project:

```bash
# Link the CLI to your Supabase project (run once)
supabase link --project-ref your-project-ref

# Push all migrations
supabase db push
```

You can find your `project-ref` in the Supabase dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`.

### 5. Deploy Edge Functions

The AI analysis pipeline runs in two Supabase Edge Functions (`analyze-deal` and `classify-deal`). They need the Anthropic API key and your service-role key set as secrets.

```bash
# Set secrets (values are read from your terminal — not stored in any file)
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-api-key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Deploy both functions
supabase functions deploy analyze-deal
supabase functions deploy classify-deal
```

### 6. Run the development server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. You will be redirected to the login page. Create an account using your email or use the Supabase dashboard to invite users.

---

## Environment variables reference

| Variable | Where it lives | Description |
|----------|---------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Supabase project URL (safe to expose to browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Supabase anon/public key (safe to expose to browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secret | Service-role key — bypasses RLS; **never expose to browser** |
| `ANTHROPIC_API_KEY` | Edge Function secret | Anthropic Claude API key; **never expose to browser** |

---

## Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js development server on port 3000 |
| `npm run build` | Build the app for production |
| `npm start` | Start the production server (after `npm run build`) |
| `npm run lint` | Run ESLint across the project |
| `npm test` | Run the test suite with Vitest |
| `npm run test:watch` | Run Vitest in watch mode |

---

## Project structure

```
.
├── app/                  # Next.js App Router pages and layouts
│   ├── auth/             # Auth callback route
│   ├── login/            # Login / sign-up page
│   ├── screenings/       # Screening history and results pages
│   └── upload/           # Document upload page
├── lib/
│   ├── actions/          # Next.js Server Actions
│   ├── api/              # Edge Function client helpers
│   ├── prompts/          # Claude prompt templates (PE and IP/Tech tracks)
│   └── supabase/         # Supabase client helpers (browser + server)
├── supabase/
│   ├── functions/        # Edge Functions (analyze-deal, classify-deal)
│   └── migrations/       # SQL migration files
├── types/                # TypeScript type definitions (ISTAnalysis, etc.)
├── .env.local.example    # Environment variable template
└── docs/
    └── IST_Screener_PRD.md  # Full product requirements document
```

---

## Learn more

- [Next.js documentation](https://nextjs.org/docs)
- [Supabase documentation](https://supabase.com/docs)
- [Supabase CLI reference](https://supabase.com/docs/reference/cli)
- [Anthropic API documentation](https://docs.anthropic.com)
- [Product Requirements Document](docs/IST_Screener_PRD.md)
