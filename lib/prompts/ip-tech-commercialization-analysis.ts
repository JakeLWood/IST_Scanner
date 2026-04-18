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

import type { ISTAnalysis } from "../../types/ist";

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
  // _analysisDate is accepted for API compatibility but generated_at uses
  // the live clock for accuracy.
  _analysisDate: string = new Date().toISOString().slice(0, 10),
): string {
  const generatedAt = new Date().toISOString();
  return `\
Perform a complete Investment Screening Tool (IST) analysis on the following IP / \
Technology Commercialization deal materials and return a single JSON object that EXACTLY \
matches the ISTAnalysis schema shown below. Do not include anything outside the JSON object.

This is an IP / Technology Commercialization track analysis. Catalyze's core thesis is \
"orthogonal application": technology proven in one domain unlocks its greatest value \
when applied to adjacent markets the original inventors did not target. Every section \
must be evaluated through this lens in addition to the standard IST criteria.

CRITICAL OUTPUT REQUIREMENTS (PRD §9.2 quality benchmarks — same rules as Traditional PE):
1. snapshot — populate ALL fourteen fields; use null only when truly unavailable.
2. strengths — 3–6 entries, each with supporting_data[] containing specific numbers, \
   percentages, TRL ratings, patent counts, or named entities. No generic claims.
3. risks — severity "High", "Medium", or "Low"; mitigation and evidence per entry.
4. value_creation — both near_term and medium_term arrays MUST be non-empty with \
   numeric ebitda_impact_low and ebitda_impact_high on every initiative.
5. recommendation.verdict — "PROCEED", "FURTHER_REVIEW", or "PASS" (all caps).

=== ISTAnalysis JSON Schema ===
{
  "schema_version": "1.0",
  "generated_at": "<ISO-8601 timestamp, e.g. ${generatedAt}>",
  "company_name": "<company / entity name>",
  "deal_type": "ip_technology",

  "snapshot": {
    "company_name": "<company name>",
    "industry": "<sector / technology domain>",
    "location": "<HQ city and state, or null>",
    "transaction_type": "<e.g. 'IP License Acquisition', 'Equity Stake', 'Spin-out'>",
    "revenue": <annual revenue in USD, or null if pre-revenue>,
    "ebitda": <EBITDA in USD, or null>,
    "ebitda_margin": <EBITDA/Revenue as percentage, or null>,
    "revenue_growth_rate": <annual CAGR as percentage, or null>,
    "asking_price": <valuation / asking price in USD, or null>,
    "ev_ebitda_multiple": <EV/EBITDA multiple, or null>,
    "employee_count": <FTEs as a number, or null>,
    "year_founded": <four-digit year, or null>,
    "deal_source": "<e.g. 'Proprietary', 'Investment Bank', 'University TTO'>",
    "customer_concentration_pct": <largest customer as % of revenue, or null>
  },

  "strengths": [
    {
      "category": "<e.g. 'IP Strength', 'Technology Readiness', 'Market Position'>",
      "title": "<specific title with TRL or patent count if available>",
      "description": "<2–3 sentences explaining the strength>",
      "supporting_data": [
        "<specific data point with number/TRL/patent count/entity>",
        "..."
      ]
    }
  ],

  "risks": [
    {
      "risk": "<concise risk, e.g. 'IP invalidation risk — competing patent filing by [company]'>",
      "severity": "<'High' | 'Medium' | 'Low'>",
      "mitigation": "<specific mitigant grounded in the document>",
      "evidence": "<document-grounded evidence for both the risk and the mitigant>"
    }
  ],

  "value_creation": {
    "near_term": [
      {
        "initiative": "<e.g. 'Phase 1 licensing deal with lead aerospace customer'>",
        "ebitda_impact_low": <USD number — REQUIRED>,
        "ebitda_impact_high": <USD number — REQUIRED>,
        "investment_required": <USD number or null>,
        "timeline": "<e.g. 'Q1–Q3 Year 1'>"
      }
    ],
    "medium_term": [
      {
        "initiative": "<e.g. 'Orthogonal application: defense market licensing'>",
        "ebitda_impact_low": <USD number — REQUIRED>,
        "ebitda_impact_high": <USD number — REQUIRED>,
        "investment_required": <USD number or null>,
        "timeline": "<e.g. 'Year 2–3'>"
      }
    ],
    "exit_positioning": [
      {
        "initiative": "<e.g. 'Strategic sale to tier-1 aerospace prime'>",
        "ebitda_impact_low": null,
        "ebitda_impact_high": null,
        "investment_required": null,
        "timeline": "<e.g. 'Year 4–5'>"
      }
    ]
  },

  // Dimensions for IP / Technology track:
  //   technology_readiness, ip_strength_defensibility, commercialization_pathway,
  //   orthogonal_application_potential, market_attractiveness, management_team, risk_profile
  "scores": [
    {
      "dimension": "<dimension key>",
      "score": <1–10 integer or null>,
      "justification": "<2–3 sentences — for technology_readiness cite the TRL level>",
      "data_gaps": ["<missing data that limits the score>"]
    }
  ],

  "recommendation": {
    "verdict": "<'PROCEED' | 'FURTHER_REVIEW' | 'PASS'>",
    "reasoning": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
    "suggested_loi_terms": "<proposed terms or null if not PROCEED>",
    "disqualifying_factors": null
  },

  "key_questions": [
    {
      "question": "<specific, targeted question for the deal team>",
      "validates": "<risk or thesis element this question tests>"
    }
  ],

  "data_quality": {
    "completeness_pct": <0–100>,
    "missing_critical_fields": ["<field name if absent>"],
    "caveats": ["<data limitation or OCR/redaction caveat>"]
  }
}
=== End of Schema ===

=== Deal Materials ===
${extractedText}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown fences, no prose, no code blocks.
`;
}
