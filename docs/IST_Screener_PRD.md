# IST Screener — Product Requirements Document

> **Status:** Draft — replace this placeholder content with your actual PRD.
>
> **How to use this file:** Fill in each section below with your requirements. All
> Copilot coding agents are instructed (via `.github/copilot-instructions.md`) to read
> this document before starting any task, so the more detail you add here the better
> the generated code will match your vision.

---

## 1. Overview

### 1.1 Purpose

<!-- Describe what the IST Screener does and why it exists. -->

### 1.2 Target Users

<!-- Who will use this tool? (e.g. analysts, portfolio managers, deal-team members) -->

### 1.3 Success Metrics

<!-- How will you measure whether the product is successful? -->

---

## 2. Problem Statement

<!-- Describe the problem this product solves. What manual process does it replace or improve? -->

---

## 3. Scope

### 3.1 In Scope

<!-- List features/capabilities that MUST be built. -->

### 3.2 Out of Scope

<!-- List things explicitly excluded from this version. -->

---

## 4. User Stories & Functional Requirements

### 4.1 Authentication & Authorization

<!-- e.g. Users log in via Supabase Auth; admin role vs analyst role; etc. -->

### 4.2 Document Upload & Processing

<!-- e.g. Accepted file types, size limits, OCR / text extraction pipeline. -->

### 4.3 AI Screening & Scoring

<!-- e.g. Which model (Claude), what prompt, scoring dimensions, thresholds. -->

### 4.4 Disqualifiers

<!-- e.g. Rules that auto-reject a deal; how they are configured; how they appear in the UI. -->

### 4.5 Results & Recommendations

<!-- e.g. Output format, verdict values (PROCEED / FURTHER_REVIEW / PASS), PDF export. -->

### 4.6 Admin Configuration

<!-- e.g. Scoring rubric editor, system prompt editor, disqualifier manager. -->

### 4.7 Audit & Reporting

<!-- e.g. API usage log, override history, cost dashboard. -->

---

## 5. Non-Functional Requirements

### 5.1 Performance

<!-- e.g. Max latency for AI response, file-upload size limits. -->

### 5.2 Security

<!-- e.g. RLS on every table, service-role-only writes to api_usage_log, secret management. -->

### 5.3 Reliability & Error Handling

<!-- e.g. Retry logic for Claude API, graceful UI errors, Supabase edge-function timeouts. -->

### 5.4 Accessibility

<!-- e.g. WCAG 2.1 AA, keyboard navigation, screen reader support. -->

---

## 6. Technical Architecture

### 6.1 Tech Stack

| Layer       | Choice                          |
| ----------- | ------------------------------- |
| Frontend    | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend     | Supabase (Postgres + Edge Functions) |
| AI          | Anthropic Claude (via API)      |
| Auth        | Supabase Auth                   |
| Storage     | Supabase Storage                |

### 6.2 High-Level Architecture

<!-- Diagram or description of how components interact. -->

### 6.3 Key API Contracts

<!-- Describe the shape of the JSON Claude is expected to return, or any other important interfaces. -->

---

## 7. Data Model

### 7.1 Tables

<!-- Reference supabase/migrations/ for the authoritative schema.
     Add notes here about business rules not obvious from the SQL. -->

| Table                 | Purpose |
| --------------------- | ------- |
| `users`               |         |
| `screenings`          |         |
| `screening_documents` |         |
| `scoring_config`      |         |
| `disqualifiers`       |         |
| `system_prompts`      |         |
| `api_usage_log`       |         |
| `screening_overrides` |         |

### 7.2 Indexes

<!-- Notable indexes and why they exist. -->

---

## 8. UI / UX

### 8.1 Pages & Routes

<!-- List each page/route, its purpose, and any special requirements. -->

### 8.2 Design System

<!-- Fonts, colour palette, component library (e.g. shadcn/ui), dark-mode support. -->

### 8.3 Wireframes / Mockups

<!-- Link to Figma or embed images here. -->

---

## 9. Integrations

<!-- Third-party services, webhooks, or APIs beyond Claude and Supabase. -->

---

## 10. Open Questions

<!-- List any unresolved decisions that need answers before or during development. -->

---

## 11. Revision History

| Date       | Author | Change |
| ---------- | ------ | ------ |
| <!-- YYYY-MM-DD --> | <!-- name --> | Initial draft |
