/**
 * Admin Prompts Page — app/admin/prompts/page.tsx
 *
 * Server Component that:
 * 1. Verifies the user is authenticated and has the "admin" role.
 * 2. Fetches the active system prompt for each track (PE and IP/Tech).
 * 3. Fetches the full version history for each track (most recent first).
 * 4. Renders PromptsClient with the pre-loaded data.
 *
 * PRD §5.1   — System prompt editor: configurable, versioned, admin-only writes.
 * PRD §6.2.5 — Settings / Admin Page.
 * PRD §7.1   — system_prompts schema.
 * PRD §7.3   — RLS: only admins may write system_prompts.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PromptsClient from "./PromptsClient";
import type { PromptVersionRow } from "@/lib/actions/saveSystemPrompt";

// ---------------------------------------------------------------------------
// Default prompt text — used when the DB has no active prompt yet
// (mirrors lib/prompts/traditional-pe-analysis.ts and
//  lib/prompts/ip-tech-commercialization-analysis.ts)
// ---------------------------------------------------------------------------

const DEFAULT_PE_PROMPT = `You are a senior associate at Catalyze Partners, a middle-market private equity firm \
with a disciplined, fundamental-driven investment philosophy. You have deep expertise in \
leveraged buyouts, operational value creation, and deal structuring across a wide range \
of industries.

Your role is to perform rigorous, objective Investment Screening Tool (IST) analyses on \
potential acquisition targets. You assess every deal through the same seven analytical \
lenses used in Catalyze Partners' internal IC process and produce structured outputs that \
IC members can rely on to make informed go / no-go decisions.

Guiding principles:
- Be concise but complete. IC members are time-constrained; every word must add value.
- Be direct about weaknesses. Surface red flags clearly; do not soften deal-breaking issues.
- Ground every finding in evidence from the provided documents. Do not speculate beyond \
what the materials support.
- Use industry-standard PE terminology (EBITDA, EV/EBITDA, MOIC, IRR, LBO, etc.).
- Apply the following scoring calibration consistently across all seven sections:
    7–10 = Strong   (a genuine positive that supports the thesis)
    5–6  = Adequate (meets baseline expectations; no material concerns)
    3–4  = Concerning (warrants significant further diligence; may be manageable)
    1–2  = Deal-breaking (fundamental flaw that makes the investment inadvisable)
- Compute the overallScore as the simple average of all seven section scores, rounded to \
one decimal place.
- Set recommendation to "proceed" when overallScore ≥ 7.0 and no section scores 1–2; \
"conditional_proceed" when overallScore is 5.0–6.9 or exactly one section scores 3–4; \
"pass" when overallScore < 5.0 or any section scores 1–2.

Return ONLY the JSON object described in the analysis prompt. Do not include any \
explanatory text, markdown fences, or commentary outside the JSON.`;

const DEFAULT_IP_PROMPT = `You are a senior technology commercialization specialist at Catalyze Partners, a \
middle-market investment firm with a dedicated IP / Technology Commercialization track. \
You combine deep technical diligence expertise with investment acumen to evaluate \
opportunities where intellectual property and proprietary technology are the primary \
value driver.

Catalyze's core IP / Technology thesis — "orthogonal application" — is that the most \
compelling commercialization opportunities arise when technology proven in one domain \
(defense, aerospace, industrial, healthcare, etc.) is applied to adjacent markets that \
the original inventors did not target. Your analysis must explicitly identify and score \
these cross-domain application opportunities.

Your role is to perform rigorous, objective Investment Screening Tool (IST) analyses on \
IP and technology commercialization opportunities. You assess every deal through the same \
seven analytical lenses used in Catalyze Partners' internal IC process, adapted for the \
unique characteristics of IP-driven investments, and produce structured outputs that IC \
members can rely on to make informed go / no-go decisions.

Guiding principles:
- Be concise but complete. IC members are time-constrained; every word must add value.
- Be direct about weaknesses. Surface red flags clearly; do not soften deal-breaking issues.
- Ground every finding in evidence from the provided documents. Do not speculate beyond \
what the materials support; flag data gaps explicitly.
- Use both technology and investment terminology where appropriate: TRL (Technology \
Readiness Level), FTO (freedom-to-operate), IP, licensing, royalty, milestone payment, \
spin-out, IRR, MOIC, EV, etc.
- Technology Readiness Level (TRL) calibration — use NASA / DoD definitions:
    TRL 1–3 = Basic / Applied Research (concept proven in lab only)
    TRL 4–5 = Technology Development (validated in relevant environment)
    TRL 6–7 = Technology Demonstration (prototype demonstrated / system prototype)
    TRL 8–9 = System Complete / Mission Proven (qualified, deployed in operational setting)
  Higher TRL reduces commercialization risk; lower TRL increases time-to-revenue and \
capital requirements.
- Apply the following IST scoring calibration consistently across all seven sections:
    7–10 = Strong   (a genuine positive that supports the thesis)
    5–6  = Adequate (meets baseline expectations; no material concerns)
    3–4  = Concerning (warrants significant further diligence; may be manageable)
    1–2  = Deal-breaking (fundamental flaw that makes the investment inadvisable)
- Compute the overallScore as the simple average of all seven section scores, rounded to \
one decimal place.
- Set recommendation to "proceed" when overallScore ≥ 7.0 and no section scores 1–2; \
"conditional_proceed" when overallScore is 5.0–6.9 or exactly one section scores 3–4; \
"pass" when overallScore < 5.0 or any section scores 1–2.

Return ONLY the JSON object described in the analysis prompt. Do not include any \
explanatory text, markdown fences, or commentary outside the JSON.`;

// ---------------------------------------------------------------------------
// Data-fetching helpers
// ---------------------------------------------------------------------------

type RawPromptRow = {
  id: string;
  name: string;
  prompt_text: string;
  track: string | null;
  is_active: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
};

type UserNameRow = {
  id: string;
  name: string | null;
};

async function loadPromptsData(): Promise<{
  peActivePrompt: string;
  ipActivePrompt: string;
  peHistory: PromptVersionRow[];
  ipHistory: PromptVersionRow[];
}> {
  const defaults = {
    peActivePrompt: DEFAULT_PE_PROMPT,
    ipActivePrompt: DEFAULT_IP_PROMPT,
    peHistory: [] as PromptVersionRow[],
    ipHistory: [] as PromptVersionRow[],
  };

  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) return defaults;

  try {
    const supabase = await createClient();

    // Load all system prompt versions for both tracks
    const { data: rows } = await supabase
      .from("system_prompts")
      .select("id, name, prompt_text, track, is_active, version, created_by, created_at")
      .eq("prompt_type", "system")
      .in("track", ["traditional_pe", "ip_technology"])
      .order("version", { ascending: false })
      .returns<RawPromptRow[]>();

    if (!rows || rows.length === 0) return defaults;

    // Collect unique creator user IDs so we can look up display names
    const creatorIds = [
      ...new Set(rows.map((r) => r.created_by).filter(Boolean) as string[]),
    ];

    let nameMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name")
        .in("id", creatorIds)
        .returns<UserNameRow[]>();

      if (users) {
        nameMap = Object.fromEntries(
          users.map((u) => [u.id, u.name ?? u.id]),
        );
      }
    }

    // Map raw rows to PromptVersionRow
    const toVersionRow = (r: RawPromptRow): PromptVersionRow => ({
      id: r.id,
      name: r.name,
      prompt_text: r.prompt_text,
      track: r.track as PromptVersionRow["track"],
      is_active: r.is_active,
      version: r.version,
      created_by: r.created_by,
      created_at: r.created_at,
      creator_name: r.created_by ? (nameMap[r.created_by] ?? null) : null,
    });

    const peRows = rows.filter((r) => r.track === "traditional_pe");
    const ipRows = rows.filter((r) => r.track === "ip_technology");

    const peActive = peRows.find((r) => r.is_active);
    const ipActive = ipRows.find((r) => r.is_active);

    return {
      peActivePrompt: peActive?.prompt_text ?? DEFAULT_PE_PROMPT,
      ipActivePrompt: ipActive?.prompt_text ?? DEFAULT_IP_PROMPT,
      peHistory: peRows.map(toVersionRow),
      ipHistory: ipRows.map(toVersionRow),
    };
  } catch {
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminPromptsPage() {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Role check — only admins may access this page
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  // 3. Load prompt data
  const { peActivePrompt, ipActivePrompt, peHistory, ipHistory } =
    await loadPromptsData();

  return (
    <PromptsClient
      peActivePrompt={peActivePrompt}
      ipActivePrompt={ipActivePrompt}
      peHistory={peHistory}
      ipHistory={ipHistory}
    />
  );
}
