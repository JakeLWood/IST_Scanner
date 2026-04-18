/**
 * Traditional PE Track – Claude Prompts
 *
 * PRD Section 5.1: System prompt that establishes Claude's persona and role.
 * PRD Section 5.2: Analysis prompt that drives the full IST output in the
 *                  canonical PRD §5.4 schema (types/ist.ts ISTAnalysis).
 *
 * QA Benchmark alignment (PRD §9.2):
 *   1. snapshot  — all §4.2.1 fields, including 5 financial metrics,
 *                  growth rate, employee_count, location, deal_source
 *   2. strengths — 3–6 entries, each with specific supporting_data[]
 *   3. risks     — severity High|Medium|Low, mitigation, evidence per entry
 *   4. value_creation — near_term + medium_term with EBITDA impact ranges
 *   5. recommendation.verdict — PROCEED | FURTHER_REVIEW | PASS with
 *                               suggested LOI terms when PROCEED
 *
 * Exports:
 *   TRADITIONAL_PE_SYSTEM_PROMPT        – static string for the "system" role
 *   buildTraditionalPEAnalysisPrompt()  – factory that injects deal text into the "user" role
 *   TraditionalPEAnalysisResult         – convenience re-export of ISTAnalysis for this track
 */

import type { ISTAnalysis } from "../../types/ist";

// Re-export so callers have a single import point
export type TraditionalPEAnalysisResult = ISTAnalysis;

// ---------------------------------------------------------------------------
// PRD Section 5.1 – System Prompt
// ---------------------------------------------------------------------------

/**
 * Establishes Claude as a senior PE associate at Catalyze Partners.
 * Injected into the Anthropic API `system` parameter on every analysis call.
 */
export const TRADITIONAL_PE_SYSTEM_PROMPT = `\
You are a senior associate at Catalyze Partners, a middle-market private equity firm \
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
- CONTRADICTORY INFORMATION: If you detect contradictory or inconsistent information \
  within the document (e.g., revenue stated differently in different sections), flag it \
  explicitly in the relevant section's commentary using the format: \
  "CONTRADICTION DETECTED: [description with specific references to where each figure appears]."
- HYBRID DEAL TYPE: If the deal exhibits characteristics of both a traditional PE company \
  and an IP/technology asset (e.g., an operating company with significant patented \
  technology or meaningful R&D revenue), note this hybrid nature explicitly in the \
  executiveSummary. Within the investmentThesis and riskAssessment sections, include \
  evaluation of IP-related dimensions (patent coverage, freedom-to-operate, technology \
  risk) even though the primary classification is traditional_pe.

Return ONLY the JSON object described in the analysis prompt. Do not include any \
explanatory text, markdown fences, or commentary outside the JSON.
`;

// ---------------------------------------------------------------------------
// PRD Section 5.2 – Analysis Prompt Factory
// ---------------------------------------------------------------------------

/**
 * Builds the user-role prompt for a Traditional PE IST analysis.
 *
 * The returned JSON MUST conform to the canonical PRD §5.4 ISTAnalysis schema
 * (types/ist.ts) so that the five automated quality benchmarks (PRD §9.2) pass:
 *   1. snapshot     — all §4.2.1 fields including financial metrics, growth rate,
 *                     employee_count, location, and deal_source
 *   2. strengths    — 3–6 entries with category, title, description, and
 *                     supporting_data[] containing specific numeric data points
 *   3. risks        — severity (High|Medium|Low), mitigation, evidence per entry
 *   4. value_creation — near_term + medium_term initiatives with ebitda_impact_low
 *                     and ebitda_impact_high; exit_positioning items are optional
 *   5. recommendation.verdict — "PROCEED" | "FURTHER_REVIEW" | "PASS" with
 *                     suggested_loi_terms when verdict is PROCEED
 *
 * @param extractedText - Raw text extracted from the deal documents
 *                        (CIM, management presentation, financials, etc.)
 * @param analysisDate  - ISO 8601 date string (YYYY-MM-DD) for when the analysis
 *                        is being performed. Defaults to today's date.
 * @returns Prompt string to pass as the `user` message to Claude
 */
export function buildTraditionalPEAnalysisPrompt(
  extractedText: string,
  // analysisDate is accepted for API compatibility but generated_at uses
  // the live clock for accuracy; prefix with _ to suppress unused-var lint.
  _analysisDate: string = new Date().toISOString().slice(0, 10),
): string {
  const generatedAt = new Date().toISOString();
  return `\
Perform a complete Investment Screening Tool (IST) analysis on the following deal \
materials and return a single JSON object that EXACTLY matches the ISTAnalysis schema \
shown below. Do not include anything outside the JSON object.

CRITICAL OUTPUT REQUIREMENTS (PRD §9.2 quality benchmarks):
1. snapshot — populate ALL fourteen fields; use null only when the document truly \
   does not provide the data. Never omit a field entirely.
2. strengths — identify 3–6 investment strengths. Every strength MUST have at least \
   one supporting_data entry that contains a specific number, percentage, currency \
   figure, or named entity (company name, product name). Generic claims without data \
   points ("strong market position", "good growth") will fail the quality check.
3. risks — identify every material risk PE professionals would care about. Each risk \
   MUST have: severity ("High", "Medium", or "Low"), mitigation text, and evidence \
   text grounded in the document.
4. value_creation — both near_term (12–24 month) and medium_term (24–36 month) arrays \
   MUST be non-empty. Every initiative in these arrays MUST have numeric \
   ebitda_impact_low AND ebitda_impact_high values. Exit positioning items may have \
   null EBITDA ranges.
5. recommendation.verdict — use "PROCEED", "FURTHER_REVIEW", or "PASS" (all caps). \
   When verdict is "PROCEED", populate suggested_loi_terms with the proposed \
   valuation range and deal structure. Include 3–5 concise reasoning bullets.

=== ISTAnalysis JSON Schema ===
{
  "schema_version": "1.0",
  "generated_at": "<ISO-8601 timestamp, e.g. ${generatedAt}>",
  "company_name": "<company name from the materials>",
  "deal_type": "traditional_pe",

  // ── SECTION I: Investment Snapshot ──────────────────────────────────────
  // Quick-reference header. All 14 fields are REQUIRED in the output object.
  // Use null (not omit) when data is unavailable. Revenue + EBITDA must not
  // both be null (flag as Insufficient Data if they are).
  "snapshot": {
    "company_name": "<company name>",
    "industry": "<sector / industry, e.g. 'Aerospace & Industrial Tooling'>",
    "location": "<HQ city and state, e.g. 'Westlake Village, CA'>",
    "transaction_type": "<e.g. '100% Acquisition (Founder Retirement)'>",
    "revenue": <annual revenue in USD as a number, or null>,
    "ebitda": <adj. EBITDA in USD as a number, or null>,
    "ebitda_margin": <EBITDA/Revenue as a percentage number, e.g. 10.5, or null>,
    "revenue_growth_rate": <annual revenue CAGR as a percentage number, e.g. 14, or null>,
    "asking_price": <asking price / valuation in USD as a number, or null>,
    "ev_ebitda_multiple": <EV/EBITDA multiple as a number, e.g. 5.25, or null>,
    "employee_count": <number of FTEs as a number, or null>,
    "year_founded": <four-digit year as a number, or null>,
    "deal_source": "<e.g. 'Proprietary', 'Investment Bank', 'Broker'>",
    "customer_concentration_pct": <largest single customer as % of revenue, or null>
  },

  // ── SECTION II: Investment Strengths ────────────────────────────────────
  // 3–6 entries. Each supporting_data item MUST contain a specific number,
  // percentage, currency figure, or named entity. No generic claims.
  // Categories to consider: Market Position, Business Model, Financial Profile,
  // Market Tailwinds, IP & Differentiation, Customer Quality, Growth Trajectory
  "strengths": [
    {
      "category": "<e.g. 'Market Position'>",
      "title": "<short, specific title, e.g. '40+ Year Defensible Aerospace Niche'>",
      "description": "<2–3 sentence explanation of why this is a genuine strength>",
      "supporting_data": [
        "<specific data point with number/entity, e.g. '40+ year relationships with Boeing and Lockheed Martin'>",
        "<second data point, e.g. 'Largest customer = 7% of revenue (low concentration)'>",
        "..."
      ]
    }
  ],

  // ── SECTION III: Risk Assessment ────────────────────────────────────────
  // Identify ALL material risks a PE professional would consider.
  // Common categories: founder/key-person dependency, customer concentration,
  // supplier concentration, technology obsolescence, regulatory, cyclicality,
  // competitive threats, working capital, lease/facility, integration complexity.
  // severity MUST be one of: "High", "Medium", "Low" (exactly as written).
  "risks": [
    {
      "risk": "<concise risk description, e.g. 'Founder / key-person dependency'>",
      "severity": "<'High' | 'Medium' | 'Low'>",
      "mitigation": "<specific mitigant, e.g. 'VP with 15 years tenure manages day-to-day operations'>",
      "evidence": "<supporting evidence from the document, e.g. 'Document confirms VP tenure and 12-month founder advisory period'>"
    }
  ],

  // ── SECTION IV: Value Creation Thesis ───────────────────────────────────
  // Both near_term and medium_term MUST be non-empty arrays.
  // Every near_term and medium_term initiative MUST have numeric EBITDA impact
  // ranges. Total near_term + medium_term upside should sum to a meaningful
  // percentage of entry EBITDA (aim for 30%+ per PRD §3.2).
  "value_creation": {
    "near_term": [
      {
        "initiative": "<specific initiative description>",
        "ebitda_impact_low": <low-end USD estimate as a number — REQUIRED>,
        "ebitda_impact_high": <high-end USD estimate as a number — REQUIRED>,
        "investment_required": <capex/opex required in USD, or null if unknown>,
        "timeline": "<e.g. 'Q1–Q4 Year 1'>"
      }
    ],
    "medium_term": [
      {
        "initiative": "<specific initiative description>",
        "ebitda_impact_low": <low-end USD estimate as a number — REQUIRED>,
        "ebitda_impact_high": <high-end USD estimate as a number — REQUIRED>,
        "investment_required": <capex/opex required in USD, or null if unknown>,
        "timeline": "<e.g. 'Year 2–3'>"
      }
    ],
    "exit_positioning": [
      {
        "initiative": "<e.g. 'Strategic sale to aerospace OEM distributor'>",
        "ebitda_impact_low": null,
        "ebitda_impact_high": null,
        "investment_required": null,
        "timeline": "<e.g. 'Year 4–5'>"
      }
    ]
  },

  // ── SECTION V: Dimension Scores ─────────────────────────────────────────
  // Score each dimension 1–10 using the calibration below.
  // Include a 2–3 sentence justification per dimension.
  // Dimensions for Traditional PE:
  //   market_attractiveness, competitive_position, management_team,
  //   customer_quality, value_creation_potential, risk_profile,
  //   financial_quality, valuation_attractiveness
  //
  // Scoring calibration:
  //   7–10 = Strong   (genuine positive supporting the thesis)
  //   5–6  = Adequate (meets baseline; no material concerns)
  //   3–4  = Concerning (significant diligence needed)
  //   1–2  = Deal-breaking (fundamental flaw)
  "scores": [
    {
      "dimension": "<e.g. 'market_attractiveness'>",
      "score": <1–10 integer, or null if insufficient data>,
      "justification": "<2–3 sentence explanation>",
      "data_gaps": ["<field or document needed if score is limited by missing data>"]
    }
  ],

  // ── SECTION VI: Recommendation ──────────────────────────────────────────
  // verdict MUST be: "PROCEED", "FURTHER_REVIEW", or "PASS" (all caps).
  // Include 3–5 reasoning bullets regardless of verdict.
  // Populate suggested_loi_terms ONLY when verdict === "PROCEED".
  // Populate disqualifying_factors ONLY when verdict === "PASS".
  "recommendation": {
    "verdict": "<'PROCEED' | 'FURTHER_REVIEW' | 'PASS'>",
    "reasoning": [
      "<bullet 1 — concise justification>",
      "<bullet 2>",
      "<bullet 3>"
    ],
    "suggested_loi_terms": "<e.g. '$5.0–5.5M (4.9–5.4x TTM Adj. EBITDA); 80% cash / 20% seller note' — null if not PROCEED>",
    "disqualifying_factors": null
  },

  // ── SECTION VII: Key Questions ───────────────────────────────────────────
  // 5–10 targeted questions for the deal team to ask management or the
  // intermediary. Each question MUST include a 'validates' field that
  // names the specific risk, assumption, or thesis element it tests.
  "key_questions": [
    {
      "question": "<specific, non-obvious question>",
      "validates": "<e.g. 'Founder dependency risk (Medium severity)'>"
    }
  ],

  // ── Data Quality ─────────────────────────────────────────────────────────
  "data_quality": {
    "completeness_pct": <0–100 integer>,
    "missing_critical_fields": ["<field name if absent>"],
    "caveats": ["<free-text caveat about data limitations>"]
  }
}
=== End of Schema ===

=== Deal Materials ===
${extractedText}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown fences, no prose, no code blocks.
`;
}
