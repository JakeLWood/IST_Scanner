# Copilot Coding Agent Instructions

## ⚠️ Read this first

Before starting **any** task in this repository, read the full Product Requirements Document:

```
docs/IST_Screener_PRD.md
```

The PRD is the authoritative source of truth for:

- Feature requirements and user stories
- Accepted/rejected scope
- AI model expectations and prompt contracts
- Data model business rules (§7)
- UI/UX design decisions (§6)
- Non-functional requirements (performance, security, accessibility)

If the PRD and any other instruction conflict, **the PRD takes precedence**.

---

## Project summary

**IST Screener** is an AI-powered investment deal-screening tool built with:

- **Frontend** — Next.js 15 (App Router), TypeScript (`strict: true`), Tailwind CSS
- **Backend** — Supabase (Postgres, Edge Functions, Auth, Storage)
- **AI** — Anthropic Claude (`claude-sonnet-4-5-20250929` or latest)

The Supabase schema lives in `supabase/migrations/`. TypeScript types are in `types/`.

---

## Coding conventions

- Use **TypeScript** everywhere; `any` is forbidden.
- Format with **Prettier** (`npm run format`) and lint with **ESLint** (`npm run lint`) before
  committing. Both are configured in `.prettierrc` and `.eslintrc.json`.
- Follow **Next.js App Router** patterns: Server Components by default, `'use client'` only when
  necessary.
- All Supabase schema changes must be expressed as **SQL migration files** in
  `supabase/migrations/` with a timestamp prefix (`YYYYMMDDHHMMSS_description.sql`).
- Every new public API route must be covered by a unit or integration test.

---

## Key PRD constraints to always respect

### Data model (PRD §7)
- `user_role` enum values are `admin | analyst | read_only` — never use other values.
- `deal_type` enum values are `traditional_pe | ip_technology`.
- `screening_recommendation` enum values are `PROCEED | FURTHER_REVIEW | PASS`.
- `composite_score` is on a **1–10 scale** (not 0–100).
- `scoring_config` stores one row per dimension per track (not a JSONB blob).
- `disqualifiers` use explicit `field`, `operator`, `value` columns (not a JSONB rule).
- `system_prompts` uses `prompt_text` column (not `content`) and has a `track` column.

### Claude response schema (PRD §5.4)
- Validate all Claude responses against `ISTAnalysis` in `types/ist.ts`.
- `scores` is an **array** of `{ dimension, score, justification, data_gaps[] }`.
- `strengths` items must have `{ category, title, description, supporting_data[] }`.
- `risks` items must have `{ risk, severity, mitigation, evidence }`.
- `value_creation` is `{ near_term[], medium_term[], exit_positioning[] }`.
- `recommendation` has `{ verdict, reasoning[], suggested_loi_terms?, disqualifying_factors? }`.
- `key_questions` items have `{ question, validates }`.

### UI (PRD §6.1)
- **Dark theme**: navy/slate backgrounds, indigo accents, green/amber/red for status.
- **Monospaced numbers**: use `font-mono` (JetBrains Mono) for all financial figures and scores.
- Scannable hierarchy: recommendation, composite score, and key strengths/risks visible without scrolling.

### Security (PRD §2.4)
- Never expose the Claude API key to the client.
- All AI requests must go through a Supabase Edge Function or Vercel serverless function.
- `api_usage_log` writes are service-role only — no `authenticated` INSERT policy.
- RLS must remain enabled on every table; new tables need policies in a new migration file.
- Never commit secrets or API keys; environment variables go in `.env.local` (listed in `.env.example`).
