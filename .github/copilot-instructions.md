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
- Data model business rules
- UI/UX design decisions
- Non-functional requirements (performance, security, accessibility)

If the PRD and any other instruction conflict, **the PRD takes precedence**.

---

## Project summary

**IST Screener** is an AI-powered deal-screening tool built with:

- **Frontend** — Next.js 15 (App Router), TypeScript (`strict: true`), Tailwind CSS
- **Backend** — Supabase (Postgres, Edge Functions, Auth, Storage)
- **AI** — Anthropic Claude

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

## Security

- Never commit secrets, API keys, or credentials.
- All environment variables go in `.env.local` (never `.env`) and must be listed in
  `.env.example` with placeholder values.
- Row-Level Security (RLS) must remain enabled on every Supabase table. Any new table needs
  corresponding policies in a new migration file.
- Writes to `api_usage_log` are service-role only — do not expose an `anon`/`authenticated`
  INSERT policy on that table.
