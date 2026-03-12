/**
 * IP / Technology Commercialization Track – Claude Prompts
 *
 * PRD Section 5.1: System prompt that establishes Claude's persona and role
 *                  for the IP / Technology Commercialization track.
 * PRD Section 5.3: Analysis prompt that drives the full 7-section IST output
 *                  with IP/Tech-specific evaluation criteria.
 *
 * Key differences from the Traditional PE track:
 *   • Technology Readiness Level (TRL 1–9) assessment embedded in companyOverview
 *     and investmentThesis sections.
 *   • IP defensibility deep dive: patent landscape, trade-secret moats,
 *     freedom-to-operate (FTO), and competitive barriers.
 *   • Commercialization pathway analysis: licensing, spin-out, direct product,
 *     and partnership routes.
 *   • Orthogonal application analysis — Catalyze core thesis: technology developed
 *     in one domain applied to adjacent markets for outsized value creation.
 *
 * Exports:
 *   IP_TECH_SYSTEM_PROMPT               – static string for the "system" role
 *   buildIPTechAnalysisPrompt()         – factory that injects deal text into the "user" role
 *   IPTechAnalysisResult                – convenience re-export of ISTAnalysis for this track
 */

import type { ISTAnalysis } from "../../types/ist-analysis";

// Re-export so callers have a single import point
export type IPTechAnalysisResult = ISTAnalysis;

// ---------------------------------------------------------------------------
// PRD Section 5.1 – System Prompt (IP / Technology Commercialization Track)
// ---------------------------------------------------------------------------

/**
 * Establishes Claude as a technology commercialization specialist at Catalyze Partners.
 * Injected into the Anthropic API `system` parameter on every IP/Tech analysis call.
 *
 * Catalyze's core IP/Technology thesis: identify technology proven in one domain and
 * unlock its value by applying it to adjacent markets that the original inventors
 * did not target — what Catalyze calls "orthogonal application."
 */
export const IP_TECH_SYSTEM_PROMPT = `\
You are a senior technology commercialization specialist at Catalyze Partners, a \
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
explanatory text, markdown fences, or commentary outside the JSON.
`;

// ---------------------------------------------------------------------------
// PRD Section 5.3 – Analysis Prompt Factory (IP / Technology Commercialization Track)
// ---------------------------------------------------------------------------

/**
 * Builds the user-role prompt for an IP / Technology Commercialization IST analysis.
 *
 * @param extractedText - Raw text extracted from the deal documents (technology
 *                        disclosure, patent filings, licensing agreements, CIM,
 *                        management presentation, financial projections, etc.)
 * @param analysisDate  - ISO 8601 date string (YYYY-MM-DD) for when the analysis
 *                        is being performed. Defaults to today's date.
 * @returns Prompt string to pass as the `user` message to Claude
 */
export function buildIPTechAnalysisPrompt(
  extractedText: string,
  analysisDate: string = new Date().toISOString().slice(0, 10),
): string {
  return `\
Perform a complete Investment Screening Tool (IST) analysis on the following IP / \
Technology Commercialization deal materials and return a single JSON object that EXACTLY \
matches the ISTAnalysis TypeScript interface shown below. Do not include anything outside \
the JSON object.

This is an IP / Technology Commercialization track analysis. Catalyze's core thesis is \
"orthogonal application": technology proven in one domain unlocks its greatest value \
when applied to adjacent markets the original inventors did not target. Every section \
must be evaluated through this lens in addition to the standard IST criteria.

=== ISTAnalysis Interface (for reference) ===
{
  "companyName":    string,          // company / entity name found in the materials
  "analysisDate":   "${analysisDate}",
  "dealType":       "ip_technology",

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
    "commentary": "<Assess the core technology or IP asset: what problem it solves, \
the underlying technical approach, and the current Technology Readiness Level (TRL 1–9 \
per NASA / DoD definitions). Describe the original application domain and how the \
technology was developed (university spin-out, corporate carve-out, independent \
inventor, etc.). Evaluate the breadth and depth of the IP portfolio (patents granted / \
pending, trade secrets, proprietary data sets, regulatory exclusivities). Note the \
remaining patent life and any material IP ownership or assignment issues. Assess the \
degree to which the technology is proven vs. still requiring development capital.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "marketOpportunity": {
    "sectionName": "Market Opportunity",
    "score": <1–10>,
    "commentary": "<Evaluate the total addressable market in the primary application \
domain, including market size, growth rate, competitive dynamics, and the technology's \
differentiated value proposition relative to incumbent solutions. \
ORTHOGONAL APPLICATION ANALYSIS (Catalyze core thesis): Identify at least two to three \
adjacent markets — outside the original application domain — where this technology could \
be applied with limited additional development. For each orthogonal market: estimate the \
addressable opportunity, describe the technical transferability (shared physics, shared \
data structure, shared manufacturing process, etc.), assess the go-to-market pathway, \
and score the opportunity's attractiveness. The presence of high-value orthogonal \
applications with clear transferability should significantly raise this section's score; \
their absence or low viability should lower it.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "financialProfile": {
    "sectionName": "Financial Profile",
    "score": <1–10>,
    "commentary": "<Assess the current financial state of the entity and the projected \
commercialization economics. Evaluate: existing revenue (product sales, licensing \
royalties, government grants, milestone payments); projected revenue ramp and key \
assumptions; cost structure and burn rate if pre-revenue; gross margin profile for \
each commercialization pathway (licensing typically 80–95% gross margin vs. direct \
product 40–70%); capital requirements to reach each TRL milestone and first commercial \
revenue; and exit valuation benchmarks (IP-focused M&A comparables, technology \
licensing multiples, or strategic acquirer premiums). Flag any financial projections \
that appear overly optimistic relative to comparable technology commercialization \
timelines.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "managementTeam": {
    "sectionName": "Management Team",
    "score": <1–10>,
    "commentary": "<Evaluate the team's combined technical depth and commercial \
execution capability — both are required for successful IP commercialization. Assess: \
technical credentials and domain expertise of the inventors / CTO; prior IP \
commercialization track record (successful licensing deals, spin-outs, or technology \
exits); presence of commercial leadership with customer development and go-to-market \
experience; IP ownership structure and assignment agreements (ensure all material IP \
is properly assigned to the entity, not retained by inventors or universities); and \
key-person risk. Note any gaps between technical and commercial capability that would \
require post-close remediation.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "investmentThesis": {
    "sectionName": "Investment Thesis",
    "score": <1–10>,
    "commentary": "<Articulate and evaluate the Catalyze commercialization thesis for \
this opportunity across three sub-dimensions: \
(1) IP DEFENSIBILITY — Assess the strength of the IP moat: claim breadth and \
defensibility of granted patents; freedom-to-operate (FTO) relative to competing IP; \
trade-secret protection; regulatory exclusivities (FDA, FAA, etc.); and the \
competitive response risk (can a well-funded incumbent design around the patents or \
develop a superior solution within the hold period?). \
(2) COMMERCIALIZATION PATHWAY — Identify and rank the most credible path(s) to \
monetization: pure licensing to industry players; co-development / joint venture with a \
strategic; direct product development and commercialization; government contract / OTA \
vehicle; or strategic sale of the IP estate. For each pathway, assess time-to-revenue, \
capital intensity, probability of success, and implied economics. \
(3) ORTHOGONAL APPLICATION UPSIDE — Quantify the incremental value creation available \
by applying this technology to the highest-potential adjacent market identified in the \
Market Opportunity section. Assess technical feasibility, capital required to unlock the \
adjacent application, and the expected MOIC uplift relative to the primary-domain-only \
scenario.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "riskAssessment": {
    "sectionName": "Risk Assessment",
    "score": <1–10>,
    "commentary": "<Identify and score the top risks specific to IP / technology \
commercialization investments, including: \
(1) Technology risk — probability that the technology fails to perform as expected at \
higher TRL levels or at commercial scale (de-risked by high TRL and field validation); \
(2) IP risk — risk of patent invalidation, adverse IPR / PGR proceedings, FTO issues \
with third-party patents, or inadequate trade-secret protection; \
(3) Commercialization / market adoption risk — risk that target customers do not adopt \
the technology at projected rates (common with disruptive or 'category-creating' \
technologies); \
(4) Regulatory risk — required approvals (FDA, FCC, FAA, EPA, export controls / ITAR) \
that could delay or block commercialization; \
(5) Funding / milestone risk — dependency on staged capital tranches tied to technical \
milestones that may slip; \
(6) Key-person / inventor risk — concentration of know-how in one or two individuals \
not contractually bound post-close. \
Higher scores reflect strong mitigants and manageable risk profiles; lower scores \
reflect unmitigated binary risks. Flag any deal-breaking risks explicitly.>",
    "keyFindings": ["<finding 1>", "..."]
  },

  "dealDynamics": {
    "sectionName": "Deal Dynamics",
    "score": <1–10>,
    "commentary": "<Assess the deal structure and return potential: \
(1) VALUATION — Evaluate the proposed entry valuation relative to comparable IP \
transactions, technology licensing multiples, and strategic acquirer precedents. For \
pre-revenue assets, assess the implied value per patent family or per TRL-adjusted \
technology milestone. \
(2) DEAL STRUCTURE — Assess the proposed investment instrument (equity, convertible, \
royalty-backed financing, milestone-contingent tranches) and its alignment with the \
technology's risk-reward profile. Note any features — milestone payments, sublicensing \
rights, co-development obligations, change-of-control provisions — that materially \
affect Catalyze's risk exposure or upside capture. \
(3) RETURN PROFILE — Model the target MOIC and IRR across the primary commercialization \
pathway and the orthogonal-application upside scenario. Identify the key assumptions \
driving returns and their sensitivity (TRL milestone timing, licensing deal size, \
strategic exit premium). \
(4) PROCESS — Characterize the deal process (proprietary, lightly competitive, broadly \
marketed) and any timing pressures. Note whether competing bidders are strategic acquirers \
(who may pay a premium) or financial sponsors (who are return-constrained).>",
    "keyFindings": ["<finding 1>", "..."]
  },

  // --- Aggregate outputs ---
  "overallScore":      number,   // simple average of all 7 section scores, 1 decimal
  "recommendation":    "proceed" | "conditional_proceed" | "pass",
  "executiveSummary":  string    // 3–5 sentence summary: core technology, TRL, primary
                                 // commercialization pathway, orthogonal application
                                 // opportunity, and Catalyze's recommended action
}
=== End of Interface ===

=== Deal Materials ===
${extractedText}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown, no prose, no code fences.
`;
}
