/**
 * Traditional PE Track – Claude Prompts
 *
 * PRD Section 5.1: System prompt that establishes Claude's persona and role.
 * PRD Section 5.2: Analysis prompt that drives the full 7-section IST output.
 *
 * Exports:
 *   TRADITIONAL_PE_SYSTEM_PROMPT        – static string for the "system" role
 *   buildTraditionalPEAnalysisPrompt()  – factory that injects deal text into the "user" role
 *   TraditionalPEAnalysisResult         – convenience re-export of ISTAnalysis for this track
 */

import type { ISTAnalysis } from "../../types/ist-analysis";

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

Return ONLY the JSON object described in the analysis prompt. Do not include any \
explanatory text, markdown fences, or commentary outside the JSON.
`;

// ---------------------------------------------------------------------------
// PRD Section 5.2 – Analysis Prompt Factory
// ---------------------------------------------------------------------------

/**
 * Builds the user-role prompt for a Traditional PE IST analysis.
 *
 * @param extractedText - Raw text extracted from the deal documents
 *                        (CIM, management presentation, financials, etc.)
 * @param analysisDate  - ISO 8601 date string (YYYY-MM-DD) for when the analysis
 *                        is being performed. Defaults to today's date.
 * @returns Prompt string to pass as the `user` message to Claude
 */
export function buildTraditionalPEAnalysisPrompt(
  extractedText: string,
  analysisDate: string = new Date().toISOString().slice(0, 10),
): string {
  return `\
Perform a complete Investment Screening Tool (IST) analysis on the following deal \
materials and return a single JSON object that EXACTLY matches the ISTAnalysis \
TypeScript interface shown below. Do not include anything outside the JSON object.

=== ISTAnalysis Interface (for reference) ===
{
  "companyName":    string,          // company / deal name found in the materials
  "analysisDate":   "${analysisDate}",
  "dealType":       "traditional_pe",

  // --- 7 IST Sections ---
  // Each section contains: sectionName (string), score (1–10 integer),
  //   commentary (string), keyFindings (string[])
  //
  // Scoring calibration:
  //   7–10 = Strong   — a genuine positive supporting the investment thesis
  //   5–6  = Adequate — meets baseline expectations; no material concerns
  //   3–4  = Concerning — warrants significant further diligence
  //   1–2  = Deal-breaking — fundamental flaw that makes investment inadvisable

  "companyOverview": {
    "sectionName": "Company Overview",
    "score": <1–10>,
    "commentary": "<Assess business model clarity, market positioning, competitive moat, \
revenue quality, customer concentration, and operational track record. Note any \
structural features (e.g., recurring revenue, switching costs) that affect \
investment appeal.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "marketOpportunity": {
    "sectionName": "Market Opportunity",
    "score": <1–10>,
    "commentary": "<Evaluate total addressable market size, secular growth tailwinds, \
market fragmentation (consolidation opportunity), and competitive intensity. Identify \
whether the macro environment favors or pressures the business over a typical 5-year \
hold period.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "financialProfile": {
    "sectionName": "Financial Profile",
    "score": <1–10>,
    "commentary": "<Analyze LTM and 3-year historical revenue, EBITDA, and margin \
trajectory. Assess revenue quality (recurring vs. transactional), free cash flow \
conversion, working capital dynamics, and capex requirements. Evaluate management \
projections for credibility and key assumptions.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "managementTeam": {
    "sectionName": "Management Team",
    "score": <1–10>,
    "commentary": "<Evaluate the depth and quality of the leadership team, including CEO \
and C-suite track records, industry experience, and equity rollover / alignment. \
Identify any key-person risk or talent gaps that would require post-close remediation.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "investmentThesis": {
    "sectionName": "Investment Thesis",
    "score": <1–10>,
    "commentary": "<Identify and evaluate the primary value creation levers: organic \
growth acceleration, margin improvement, bolt-on M&A, and/or multiple expansion. \
Assess the credibility and achievability of the sponsor's return thesis. Note any \
misalignment between thesis and observed business fundamentals.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "riskAssessment": {
    "sectionName": "Risk Assessment",
    "score": <1–10>,
    "commentary": "<Identify the top risks (strategic, operational, financial, \
regulatory, macro) and assess the adequacy of mitigants. Higher scores reflect \
manageable risk profiles with strong mitigants; lower scores reflect unmitigated or \
binary risks. Flag any deal-breaking risks explicitly.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "dealDynamics": {
    "sectionName": "Deal Dynamics",
    "score": <1–10>,
    "commentary": "<Assess entry valuation (EV/EBITDA multiple vs. comparable \
transactions and public comps), proposed capital structure and leverage levels, \
anticipated deal process (competitive vs. proprietary), and implied returns (target \
MOIC and IRR). Note any structural features (earnouts, rollover equity, reps & \
warranties) that affect deal attractiveness.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  // --- Aggregate outputs ---
  "overallScore":      number,   // simple average of all 7 section scores, 1 decimal
  "recommendation":    "proceed" | "conditional_proceed" | "pass",
  "executiveSummary":  string    // 3–5 sentence summary suitable for IC memo cover page
}
=== End of Interface ===

=== Deal Materials ===
${extractedText}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown, no prose, no code fences.
`;
}
