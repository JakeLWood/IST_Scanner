import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types (mirrors types/ist.ts — kept inline so the Edge Function is
// self-contained without a build step)
// PRD §5.4 canonical ISTAnalysis schema — matches what the quality benchmarks
// (PRD §9.2) validate against.
// ---------------------------------------------------------------------------

/** The deal-type track analysed. */
type DealType = 'traditional_pe' | 'ip_technology';

/** Recommendation verdict produced by Claude (PRD §3.6). */
type RecommendationVerdict = 'PROCEED' | 'FURTHER_REVIEW' | 'PASS';

/** Risk severity scale. */
type RiskSeverity = 'High' | 'Medium' | 'Low';

/** Single investment strength (IST Section II). */
interface ISTStrength {
  category: string;
  title: string;
  description: string;
  supporting_data: string[];
}

/** Single risk entry (IST Section III). */
interface ISTRisk {
  risk: string;
  severity: RiskSeverity;
  mitigation: string;
  evidence: string;
}

/** Single value-creation initiative. */
interface ISTValueCreationInitiative {
  initiative: string;
  ebitda_impact_low: number | null;
  ebitda_impact_high: number | null;
  investment_required: number | null;
  timeline: string;
}

/** Value creation thesis grouped by time horizon (IST Section IV). */
interface ISTValueCreation {
  near_term: ISTValueCreationInitiative[];
  medium_term: ISTValueCreationInitiative[];
  exit_positioning: ISTValueCreationInitiative[];
}

/** Per-dimension score on the 1–10 scale (IST Section V). */
interface ISTDimensionScore {
  dimension: string;
  score: number | null;
  justification: string;
  data_gaps: string[];
}

/** Investment snapshot — all §4.2.1 fields (IST Section I). */
interface ISTSnapshot {
  company_name: string;
  industry: string | null;
  location: string | null;
  transaction_type: string | null;
  revenue: number | null;
  ebitda: number | null;
  ebitda_margin: number | null;
  revenue_growth_rate: number | null;
  asking_price: number | null;
  ev_ebitda_multiple: number | null;
  employee_count: number | null;
  year_founded: number | null;
  deal_source: string | null;
  customer_concentration_pct: number | null;
}

/** AI-generated recommendation (IST Section VI). */
interface ISTRecommendationObj {
  verdict: RecommendationVerdict;
  reasoning: string[];
  suggested_loi_terms: string | null;
  disqualifying_factors: string[] | null;
}

/** Key question for the deal team (IST Section VII). */
interface ISTKeyQuestion {
  question: string;
  validates: string;
}

/** Data quality assessment. */
interface ISTDataQuality {
  completeness_pct: number;
  missing_critical_fields: string[];
  caveats: string[];
}

/**
 * Complete Investment Screening Tool analysis.
 * Claude must return a JSON object that exactly matches this interface.
 * Mirrors types/ist.ts ISTAnalysis in the main project (PRD §5.4).
 */
interface ISTAnalysis {
  schema_version: string;
  generated_at: string;
  company_name: string;
  deal_type: DealType;
  snapshot: ISTSnapshot;
  strengths: ISTStrength[];
  risks: ISTRisk[];
  value_creation: ISTValueCreation;
  scores: ISTDimensionScore[];
  recommendation: ISTRecommendationObj;
  key_questions: ISTKeyQuestion[];
  data_quality: ISTDataQuality;
}

// ---------------------------------------------------------------------------
// System prompts (mirrors lib/prompts/traditional-pe-analysis.ts and
// lib/prompts/ip-tech-commercialization-analysis.ts)
// ---------------------------------------------------------------------------

const TRADITIONAL_PE_SYSTEM_PROMPT = `\
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
  within the document (e.g., revenue stated as $10M in one section and $12M in another), \
  flag it explicitly in the relevant section's commentary using the format: \
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

const IP_TECH_SYSTEM_PROMPT = `\
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
- CONTRADICTORY INFORMATION: If you detect contradictory or inconsistent information \
  within the document (e.g., TRL stated as 6 in one section and 4 in another), \
  flag it explicitly in the relevant section's commentary using the format: \
  "CONTRADICTION DETECTED: [description with specific references to where each value appears]."
- HYBRID DEAL TYPE: If the deal exhibits significant operating revenue alongside IP assets, \
  note the hybrid nature explicitly in the executiveSummary and score both the IP/technology \
  dimensions and the revenue-generating business dimensions thoroughly.

Return ONLY the JSON object described in the analysis prompt. Do not include any \
explanatory text, markdown fences, or commentary outside the JSON.
`;

// ---------------------------------------------------------------------------
// Analysis prompt builders
// (mirrors buildTraditionalPEAnalysisPrompt / buildIPTechAnalysisPrompt)
// ---------------------------------------------------------------------------
// Document context flags passed to the prompt builder (PRD §9.3)
// ---------------------------------------------------------------------------

interface DocumentContextFlags {
  /** Edge case 1: document is under 200 words (low confidence caveat). */
  isShortDocument?: boolean;
  wordCount?: number;
  /** Edge case 2: document was truncated to fit the context window. */
  wasTruncated?: boolean;
  originalCharCount?: number;
  /** Edge case 3: document appears to be non-English. */
  isNonEnglish?: boolean;
  nonLatinRatio?: number;
  /** Edge case 6: document has significant redactions. */
  hasSignificantRedactions?: boolean;
  redactionCount?: number;
  redactionDensity?: string;
  /** Edge case 7: text was extracted via OCR. */
  isOCRDerived?: boolean;
}

function buildContextPreamble(flags: DocumentContextFlags): string {
  const notes: string[] = [];

  if (flags.isShortDocument) {
    notes.push(
      `LOW-CONFIDENCE ANALYSIS: This document contains only ${flags.wordCount ?? 'very few'} words, ` +
      `which is below the 200-word minimum recommended for a reliable IST analysis. ` +
      `Extract all available data, flag insufficient data explicitly in each section's ` +
      `commentary, and apply clear low-confidence caveats throughout the analysis. ` +
      `Set scores conservatively (maximum 5 for any section) to reflect data limitations.`,
    );
  }

  if (flags.wasTruncated) {
    notes.push(
      `TRUNCATED DOCUMENT: The document was too long to process in full ` +
      `(original size: ${flags.originalCharCount ? Math.round(flags.originalCharCount / 1000) + 'K chars' : 'very large'}). ` +
      `The middle section was omitted; analysis is based on the beginning and end of the document. ` +
      `Note this limitation in the executiveSummary.`,
    );
  }

  if (flags.isNonEnglish) {
    notes.push(
      `NON-ENGLISH DOCUMENT: The document appears to contain significant non-English text ` +
      `(approximately ${flags.nonLatinRatio ? Math.round(flags.nonLatinRatio * 100) : '?'}% non-Latin characters). ` +
      `English documents are preferred. Proceed with the analysis but apply a general low-confidence ` +
      `caveat and note the language limitation in the executiveSummary.`,
    );
  }

  if (flags.hasSignificantRedactions) {
    notes.push(
      `REDACTED DOCUMENT: The document contains ${flags.redactionCount ?? 'multiple'} redaction marker(s) ` +
      `(density: ${flags.redactionDensity ?? 'significant'}). ` +
      `Flag each dimension where redacted data impairs your analysis by noting ` +
      `"REDACTION NOTE: [specific data that appears redacted]" in the relevant section's commentary. ` +
      `Reduce scores proportionally in sections where key data is obscured.`,
    );
  }

  if (flags.isOCRDerived) {
    notes.push(
      `OCR-PROCESSED DOCUMENT: This document was processed via optical character recognition (OCR) ` +
      `and may contain text recognition errors, particularly in financial figures, tables, and ` +
      `proper nouns. When citing specific numbers, note potential OCR inaccuracy where relevant ` +
      `using "OCR NOTE: [concern]" in the commentary.`,
    );
  }

  if (notes.length === 0) return '';
  return `DOCUMENT PROCESSING NOTES — READ CAREFULLY BEFORE ANALYSIS:\n${notes.map((n, i) => `${i + 1}. ${n}`).join('\n\n')}\n\n`;
}

function buildAnalysisPrompt(
  extractedText: string,
  dealType: DealType,
  analysisDate: string,
  contextFlags: DocumentContextFlags = {},
): string {
  const preamble = buildContextPreamble(contextFlags);
  const now = new Date().toISOString();

  if (dealType === 'traditional_pe') {
    return `${preamble}\
Perform a complete Investment Screening Tool (IST) analysis on the following deal \
materials and return a single JSON object that EXACTLY matches the ISTAnalysis schema \
shown below. Do not include anything outside the JSON object.

CRITICAL OUTPUT REQUIREMENTS (PRD §9.2 quality benchmarks):
1. snapshot — populate ALL fourteen fields; use null only when truly unavailable. \
   Never omit a field.
2. strengths — identify 3-6 investment strengths. Every strength MUST have at least \
   one supporting_data entry with a specific number, percentage, currency figure, or \
   named entity. No generic claims.
3. risks — each risk MUST have severity ("High", "Medium", or "Low"), mitigation text, \
   and evidence text grounded in the document.
4. value_creation — both near_term and medium_term arrays MUST be non-empty. Every \
   initiative in these arrays MUST have numeric ebitda_impact_low AND ebitda_impact_high.
5. recommendation.verdict — use "PROCEED", "FURTHER_REVIEW", or "PASS" (all caps). \
   When verdict is "PROCEED", populate suggested_loi_terms with the proposed \
   valuation range and deal structure.

=== ISTAnalysis JSON Schema ===
{
  "schema_version": "1.0",
  "generated_at": "${now}",
  "company_name": "<company name from the materials>",
  "deal_type": "traditional_pe",
  "snapshot": {
    "company_name": "<company name>",
    "industry": "<sector, e.g. 'Aerospace & Industrial Tooling'>",
    "location": "<HQ city and state, or null>",
    "transaction_type": "<e.g. '100% Acquisition (Founder Retirement)'>",
    "revenue": <annual revenue in USD as a number, or null>,
    "ebitda": <adj. EBITDA in USD as a number, or null>,
    "ebitda_margin": <EBITDA/Revenue as percentage, e.g. 10.5, or null>,
    "revenue_growth_rate": <annual CAGR as percentage, e.g. 14, or null>,
    "asking_price": <asking price in USD, or null>,
    "ev_ebitda_multiple": <EV/EBITDA multiple, e.g. 5.25, or null>,
    "employee_count": <FTEs as integer, or null>,
    "year_founded": <four-digit year, or null>,
    "deal_source": "<e.g. 'Proprietary', 'Investment Bank', 'Broker', or null>",
    "customer_concentration_pct": <largest single customer as % of revenue, or null>
  },
  "strengths": [
    {
      "category": "<e.g. 'Market Position'>",
      "title": "<short specific title>",
      "description": "<2-3 sentence explanation>",
      "supporting_data": ["<data point with number/entity>", "..."]
    }
  ],
  "risks": [
    {
      "risk": "<concise risk description>",
      "severity": "<'High' | 'Medium' | 'Low'>",
      "mitigation": "<specific mitigant>",
      "evidence": "<document-grounded evidence>"
    }
  ],
  "value_creation": {
    "near_term": [
      {
        "initiative": "<specific initiative>",
        "ebitda_impact_low": <USD number REQUIRED>,
        "ebitda_impact_high": <USD number REQUIRED>,
        "investment_required": <USD number or null>,
        "timeline": "<e.g. 'Q1-Q4 Year 1'>"
      }
    ],
    "medium_term": [
      {
        "initiative": "<specific initiative>",
        "ebitda_impact_low": <USD number REQUIRED>,
        "ebitda_impact_high": <USD number REQUIRED>,
        "investment_required": <USD number or null>,
        "timeline": "<e.g. 'Year 2-3'>"
      }
    ],
    "exit_positioning": [
      {
        "initiative": "<strategic exit scenario>",
        "ebitda_impact_low": null,
        "ebitda_impact_high": null,
        "investment_required": null,
        "timeline": "<e.g. 'Year 4-5'>"
      }
    ]
  },
  "scores": [
    {
      "dimension": "<e.g. 'market_attractiveness' | 'competitive_position' | 'management_team' | 'customer_quality' | 'value_creation_potential' | 'risk_profile' | 'financial_quality' | 'valuation_attractiveness'>",
      "score": <1-10 integer or null>,
      "justification": "<2-3 sentences>",
      "data_gaps": ["<field needed if data-limited>"]
    }
  ],
  "recommendation": {
    "verdict": "<'PROCEED' | 'FURTHER_REVIEW' | 'PASS'>",
    "reasoning": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
    "suggested_loi_terms": "<valuation range + deal structure, or null if not PROCEED>",
    "disqualifying_factors": null
  },
  "key_questions": [
    { "question": "<targeted question>", "validates": "<risk or thesis element>" }
  ],
  "data_quality": {
    "completeness_pct": <0-100>,
    "missing_critical_fields": [],
    "caveats": ["<data limitation caveat>"]
  }
}
=== End of Schema ===

=== Deal Materials ===
${extractedText}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown fences, no prose, no code blocks.
`;
  }

  // IP / Technology Commercialization track
  return `${preamble}\
Perform a complete Investment Screening Tool (IST) analysis on the following IP / \
Technology Commercialization deal materials and return a single JSON object that EXACTLY \
matches the ISTAnalysis schema shown below. Do not include anything outside the JSON object.

Catalyze's core thesis is "orthogonal application": technology proven in one domain \
unlocks its greatest value when applied to adjacent markets. Evaluate every section \
through this lens in addition to the standard IST criteria.

CRITICAL OUTPUT REQUIREMENTS — same five benchmarks as the Traditional PE track \
(all must be satisfied for the quality checks to pass):
1. snapshot — all fourteen fields, null-not-omit for unavailable data.
2. strengths — 3-6 entries with specific data points (TRL levels, patent counts, \
   named customers, revenue figures) in every supporting_data entry.
3. risks — "High", "Medium", or "Low" severity; mitigation + evidence per risk.
4. value_creation — near_term and medium_term both non-empty with numeric EBITDA ranges.
5. recommendation.verdict — "PROCEED", "FURTHER_REVIEW", or "PASS" (all caps).

=== ISTAnalysis JSON Schema ===
{
  "schema_version": "1.0",
  "generated_at": "${now}",
  "company_name": "<company / entity name>",
  "deal_type": "ip_technology",
  "snapshot": {
    "company_name": "<company name>",
    "industry": "<technology domain>",
    "location": "<HQ city and state, or null>",
    "transaction_type": "<e.g. 'IP License Acquisition', 'Equity Stake', 'Spin-out'>",
    "revenue": <annual revenue in USD or null if pre-revenue>,
    "ebitda": <EBITDA in USD or null>,
    "ebitda_margin": <EBITDA/Revenue as percentage or null>,
    "revenue_growth_rate": <annual CAGR as percentage or null>,
    "asking_price": <valuation in USD or null>,
    "ev_ebitda_multiple": <EV/EBITDA or null>,
    "employee_count": <FTEs or null>,
    "year_founded": <four-digit year or null>,
    "deal_source": "<e.g. 'Proprietary', 'University TTO', or null>",
    "customer_concentration_pct": <largest customer % or null>
  },
  "strengths": [
    {
      "category": "<e.g. 'IP Strength', 'Technology Readiness', 'Market Position'>",
      "title": "<title with TRL or patent count if available>",
      "description": "<2-3 sentences>",
      "supporting_data": ["<data point with TRL/patent count/revenue/entity>", "..."]
    }
  ],
  "risks": [
    {
      "risk": "<concise risk>",
      "severity": "<'High' | 'Medium' | 'Low'>",
      "mitigation": "<specific mitigant>",
      "evidence": "<document evidence>"
    }
  ],
  "value_creation": {
    "near_term": [
      {
        "initiative": "<e.g. 'Phase 1 licensing deal with lead customer'>",
        "ebitda_impact_low": <USD REQUIRED>,
        "ebitda_impact_high": <USD REQUIRED>,
        "investment_required": <USD or null>,
        "timeline": "<e.g. 'Q1-Q3 Year 1'>"
      }
    ],
    "medium_term": [
      {
        "initiative": "<orthogonal application or commercialization milestone>",
        "ebitda_impact_low": <USD REQUIRED>,
        "ebitda_impact_high": <USD REQUIRED>,
        "investment_required": <USD or null>,
        "timeline": "<e.g. 'Year 2-3'>"
      }
    ],
    "exit_positioning": [
      {
        "initiative": "<strategic exit scenario>",
        "ebitda_impact_low": null,
        "ebitda_impact_high": null,
        "investment_required": null,
        "timeline": "<e.g. 'Year 4-5'>"
      }
    ]
  },
  "scores": [
    {
      "dimension": "<e.g. 'technology_readiness' | 'ip_strength_defensibility' | 'commercialization_pathway' | 'orthogonal_application_potential' | 'market_attractiveness' | 'management_team' | 'risk_profile'>",
      "score": <1-10 integer or null>,
      "justification": "<2-3 sentences; cite TRL level for technology_readiness>",
      "data_gaps": ["<missing data that limits score>"]
    }
  ],
  "recommendation": {
    "verdict": "<'PROCEED' | 'FURTHER_REVIEW' | 'PASS'>",
    "reasoning": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
    "suggested_loi_terms": "<proposed terms or null>",
    "disqualifying_factors": null
  },
  "key_questions": [
    { "question": "<targeted question>", "validates": "<risk or thesis element>" }
  ],
  "data_quality": {
    "completeness_pct": <0-100>,
    "missing_critical_fields": [],
    "caveats": ["<data limitation caveat>"]
  }
}
=== End of Schema ===

=== Deal Materials ===
${extractedText}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown fences, no prose, no code blocks.
`;
}

// ---------------------------------------------------------------------------
// ISTAnalysis schema validation
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

function isNumberOrNull(v: unknown): v is number | null {
  return v === null || isNumber(v);
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a single ISTStrength entry. */
function validateStrength(s: unknown): s is ISTStrength {
  if (!isObject(s)) return false;
  if (!isString(s.category) || !isString(s.title) || !isString(s.description)) return false;
  if (!isArray(s.supporting_data)) return false;
  for (const d of s.supporting_data) {
    if (!isString(d)) return false;
  }
  return true;
}

/** Validate a single ISTRisk entry. */
function validateRisk(r: unknown): r is ISTRisk {
  if (!isObject(r)) return false;
  if (!isString(r.risk)) return false;
  if (r.severity !== 'High' && r.severity !== 'Medium' && r.severity !== 'Low') return false;
  if (!isString(r.mitigation)) return false;
  if (!isString(r.evidence)) return false;
  return true;
}

/** Validate a single ISTValueCreationInitiative entry. */
function validateInitiative(i: unknown): i is ISTValueCreationInitiative {
  if (!isObject(i)) return false;
  if (!isString(i.initiative)) return false;
  if (!isNumberOrNull(i.ebitda_impact_low)) return false;
  if (!isNumberOrNull(i.ebitda_impact_high)) return false;
  if (i.investment_required !== null && i.investment_required !== undefined && !isNumber(i.investment_required)) return false;
  if (!isString(i.timeline)) return false;
  return true;
}

/** Validate a single ISTDimensionScore entry. */
function validateDimensionScore(d: unknown): d is ISTDimensionScore {
  if (!isObject(d)) return false;
  if (!isString(d.dimension)) return false;
  if (d.score !== null && d.score !== undefined && !isNumber(d.score)) return false;
  if (!isString(d.justification)) return false;
  if (!isArray(d.data_gaps)) return false;
  return true;
}

function validateISTAnalysis(data: unknown): data is ISTAnalysis {
  if (!isObject(data)) return false;

  // Top-level required fields
  if (!isString(data.schema_version)) return false;
  if (!isString(data.generated_at)) return false;
  if (!isString(data.company_name)) return false;
  if (data.deal_type !== 'traditional_pe' && data.deal_type !== 'ip_technology') return false;

  // Section I — snapshot
  if (!isObject(data.snapshot)) return false;

  // Section II — strengths (must be non-empty array)
  if (!isArray(data.strengths) || data.strengths.length === 0) return false;
  for (const s of data.strengths) {
    if (!validateStrength(s)) return false;
  }

  // Section III — risks (must be non-empty array)
  if (!isArray(data.risks) || data.risks.length === 0) return false;
  for (const r of data.risks) {
    if (!validateRisk(r)) return false;
  }

  // Section IV — value_creation
  if (!isObject(data.value_creation)) return false;
  const vc = data.value_creation as Record<string, unknown>;
  if (!isArray(vc.near_term) || vc.near_term.length === 0) return false;
  for (const i of vc.near_term) {
    if (!validateInitiative(i)) return false;
  }
  if (!isArray(vc.medium_term) || vc.medium_term.length === 0) return false;
  for (const i of vc.medium_term) {
    if (!validateInitiative(i)) return false;
  }
  if (!isArray(vc.exit_positioning)) return false;

  // Section V — scores (must be non-empty array)
  if (!isArray(data.scores) || data.scores.length === 0) return false;
  for (const s of data.scores) {
    if (!validateDimensionScore(s)) return false;
  }

  // Section VI — recommendation
  if (!isObject(data.recommendation)) return false;
  const rec = data.recommendation as Record<string, unknown>;
  if (rec.verdict !== 'PROCEED' && rec.verdict !== 'FURTHER_REVIEW' && rec.verdict !== 'PASS') return false;
  if (!isArray(rec.reasoning)) return false;

  // Section VII — key_questions (must be 5–10 items)
  if (!isArray(data.key_questions) || data.key_questions.length < 5) return false;

  return true;
}

// ---------------------------------------------------------------------------
// SHA-256 helper (Web Crypto API — available in Deno natively)
// ---------------------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Inline document preprocessor utilities (PRD §9.3)
// These mirror lib/document-preprocessor.ts — kept inline so the Edge
// Function is self-contained without a build step.
// ---------------------------------------------------------------------------

/** Approximate word count via whitespace splitting. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

const MIN_WORD_COUNT = 200;
const MAX_DOCUMENT_CHARS = 120_000;

/**
 * Truncates a document to MAX_DOCUMENT_CHARS, preserving 70 % at the head
 * (exec summary / financials) and 30 % at the tail (risk factors / terms).
 */
function truncateDocument(text: string): { truncated: string; wasTruncated: boolean; originalCharCount: number } {
  const originalCharCount = text.length;
  if (originalCharCount <= MAX_DOCUMENT_CHARS) {
    return { truncated: text, wasTruncated: false, originalCharCount };
  }
  const headChars = Math.floor(MAX_DOCUMENT_CHARS * 0.7);
  const tailChars = MAX_DOCUMENT_CHARS - headChars;
  const head = text.slice(0, headChars);
  const tail = text.slice(text.length - tailChars);
  const notice =
    `\n\n[... DOCUMENT TRUNCATED — original size: ${Math.round(originalCharCount / 1000)}K chars. ` +
    `Middle section omitted. Analysis prioritizes executive summary and risk factors. ...]\n\n`;
  return { truncated: head + notice + tail, wasTruncated: true, originalCharCount };
}

/**
 * Detects potentially non-English documents by measuring the ratio of
 * non-Latin-script Unicode letters in a 2,000-character sample.
 */
function detectNonLatinScript(text: string): { isNonLatin: boolean; nonLatinRatio: number } {
  const sample = text.slice(0, 2_000);
  const letters = [...sample].filter((ch) => /\p{L}/u.test(ch));
  if (letters.length === 0) return { isNonLatin: false, nonLatinRatio: 0 };
  const nonLatin = letters.filter((ch) => (ch.codePointAt(0) ?? 0) > 0x024f);
  const nonLatinRatio = nonLatin.length / letters.length;
  return { isNonLatin: nonLatinRatio >= 0.15, nonLatinRatio };
}

/** Patterns that indicate deliberate redactions. */
const REDACTION_PATTERNS_INLINE = [
  /\[REDACTED?\]/gi, /\[WITHHELD\]/gi, /\[REMOVED\]/gi, /\[CONFIDENTIAL\]/gi,
  /█+/g, /\*{3,}/g, /_{5,}/g, /\[[\s*]{2,}\]/g,
];

/**
 * Counts redaction markers and classifies density as none/low/moderate/high.
 */
function countRedactions(text: string): { count: number; density: 'none' | 'low' | 'moderate' | 'high' } {
  let count = 0;
  for (const pattern of REDACTION_PATTERNS_INLINE) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  const density =
    count === 0 ? 'none' :
    count < 5   ? 'low' :
    count < 20  ? 'moderate' : 'high';
  return { count, density };
}

// ---------------------------------------------------------------------------
// Edge-case flags attached to every successful analysis response (PRD §9.3)
// ---------------------------------------------------------------------------

interface EdgeCaseFlags {
  shortDocument?: { wordCount: number; warning: string };
  documentTruncated?: { originalCharCount: number; truncatedCharCount: number; warning: string };
  languageWarning?: { nonLatinRatio: number; warning: string };
  significantRedactions?: { redactionCount: number; density: string; warning: string };
  ocrUsed?: { warning: string };
}

// ---------------------------------------------------------------------------
// Market Research Enhancement (PRD §8.3)
// Fires a second Claude call with the web_search_20250305 tool enabled to
// surface real-time market data and inject it into the Market Attractiveness
// (marketOpportunity) and Competitive Position (companyOverview) sections of
// the ISTAnalysis with [Web Research] tags and source citations.
// ---------------------------------------------------------------------------

const MARKET_RESEARCH_SYSTEM_PROMPT = `\
You are a market research specialist supporting a private equity firm's deal screening \
process. Your role is to use web search to find current, factual market data that \
supplements the firm's analysis. Be precise with numbers, cite sources explicitly, and \
keep findings concise. Focus on data directly relevant to investment decision-making: \
market size, growth rates, recent transaction multiples, and competitive dynamics.

When asked to search, always search for all three topics requested. Present each \
finding with specific data points wherever possible, and always note your sources.`;

function buildMarketResearchPrompt(
  companyName: string,
  industryContext: string,
  currentYear: string,
): string {
  return `\
Using web search, find current market data to supplement a private equity deal analysis.

Company being analyzed: "${companyName}"

Industry context from the deal analysis:
${industryContext}

Please search for and summarize the following. For each topic include specific data \
points (numbers, percentages, deal sizes) and cite your sources inline.

1. MARKET SIZE & GROWTH
   Search for "[industry] market size CAGR 2024" where [industry] is the relevant \
sector inferred from the context above. Summarize: current market size, CAGR, and \
key growth drivers or headwinds.

2. COMPARABLE M&A TRANSACTIONS
   Search for "comparable M&A transactions [sector] ${currentYear}" and the prior \
two years. Summarize: recent deal multiples (EV/EBITDA), deal sizes, and notable \
strategic rationale.

3. COMPETITIVE LANDSCAPE
   Search for "${companyName} competitors". Identify: key competitors, relative \
market positions, and any competitive dynamics relevant to this investment.

Structure your response EXACTLY using these section headers (all caps, followed by a \
colon and a newline):

MARKET SIZE & GROWTH:
[2\u20133 sentences with specific numbers and inline source citations]

COMPARABLE TRANSACTIONS:
[2\u20133 sentences with specific multiples/sizes and inline source citations]

COMPETITIVE LANDSCAPE:
[2\u20133 sentences identifying key players and dynamics with inline source citations]

SOURCES:
[List every source used, one per line, prefixed with a bullet \u2022]

Keep each section to 2\u20133 concise sentences. Do not add any extra sections.`;
}

interface MarketResearchFindings {
  marketAndGrowth: string;
  comparableTransactions: string;
  competitiveLandscape: string;
  sources: string[];
}

function parseMarketResearchResponse(text: string): MarketResearchFindings {
  const findings: MarketResearchFindings = {
    marketAndGrowth: '',
    comparableTransactions: '',
    competitiveLandscape: '',
    sources: [],
  };

  const marketMatch = text.match(
    /MARKET SIZE & GROWTH:\s*([\s\S]*?)(?=COMPARABLE TRANSACTIONS:|COMPETITIVE LANDSCAPE:|SOURCES:|$)/i,
  );
  const transactionsMatch = text.match(
    /COMPARABLE TRANSACTIONS:\s*([\s\S]*?)(?=MARKET SIZE & GROWTH:|COMPETITIVE LANDSCAPE:|SOURCES:|$)/i,
  );
  const competitiveMatch = text.match(
    /COMPETITIVE LANDSCAPE:\s*([\s\S]*?)(?=MARKET SIZE & GROWTH:|COMPARABLE TRANSACTIONS:|SOURCES:|$)/i,
  );
  const sourcesMatch = text.match(
    /SOURCES:\s*([\s\S]*?)(?=MARKET SIZE & GROWTH:|COMPARABLE TRANSACTIONS:|COMPETITIVE LANDSCAPE:|$)/i,
  );

  if (marketMatch) findings.marketAndGrowth = marketMatch[1].trim();
  if (transactionsMatch) findings.comparableTransactions = transactionsMatch[1].trim();
  if (competitiveMatch) findings.competitiveLandscape = competitiveMatch[1].trim();

  if (sourcesMatch) {
    findings.sources = sourcesMatch[1]
      .trim()
      .split('\n')
      .map((line: string) => line.replace(/^[•\-*]\s*/, '').trim())
      .filter(Boolean);
  }

  return findings;
}

function buildSourcesNote(sources: string[], maxSources: number): string {
  if (sources.length === 0) return '';
  const cited = sources.slice(0, maxSources).join('; ');
  return ` [Sources: ${cited}]`;
}

function injectMarketResearch(
  analysis: ISTAnalysis,
  findings: MarketResearchFindings,
): ISTAnalysis {
  const enhanced: ISTAnalysis = { ...analysis };

  // ── Market-attractiveness strength injection ─────────────────────────────
  // Add web-research findings as a new strength entry tagged [Web Research],
  // or append to data_quality.caveats if no findings available.
  const webResearchInserts: string[] = [];
  if (findings.marketAndGrowth) {
    webResearchInserts.push(`[Web Research] Market Size & Growth: ${findings.marketAndGrowth}`);
  }
  if (findings.comparableTransactions) {
    webResearchInserts.push(`[Web Research] Comparable Transactions: ${findings.comparableTransactions}`);
  }
  if (findings.competitiveLandscape) {
    webResearchInserts.push(`[Web Research] Competitive Landscape: ${findings.competitiveLandscape}`);
  }

  if (webResearchInserts.length > 0) {
    const sourcesNote = buildSourcesNote(findings.sources, 3);
    // Inject as an additional strength entry with [Web Research] category
    enhanced.strengths = [
      ...analysis.strengths,
      {
        category: '[Web Research]',
        title: 'Market Intelligence — Real-Time Research',
        description:
          'Independent market research supplementing deal document analysis.' +
          (sourcesNote ? ' ' + sourcesNote : ''),
        supporting_data: webResearchInserts,
      },
    ];
    // Also surface key market research findings in data_quality caveats
    enhanced.data_quality = {
      ...analysis.data_quality,
      caveats: [
        ...analysis.data_quality.caveats,
        ...webResearchInserts,
      ],
    };
  }

  return enhanced;
}

interface MarketResearchCallResult {
  findings: MarketResearchFindings;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

async function performMarketResearch(
  anthropicApiKey: string,
  companyName: string,
  industryContext: string,
): Promise<MarketResearchCallResult | null> {
  const currentYear = new Date().getFullYear().toString();
  const prompt = buildMarketResearchPrompt(companyName, industryContext, currentYear);

  const startMs = Date.now();
  let researchResponse: Response;
  try {
    researchResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        system: MARKET_RESEARCH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    console.error('Market research fetch failed:', err);
    return null;
  }
  const latencyMs = Date.now() - startMs;

  if (!researchResponse.ok) {
    const errBody = await researchResponse.text().catch(() => '');
    console.error(`Market research API error ${researchResponse.status}:`, errBody);
    return null;
  }

  let researchData: Record<string, unknown>;
  try {
    researchData = await researchResponse.json();
  } catch {
    console.error('Failed to parse market research JSON response');
    return null;
  }

  const usage = researchData?.usage as Record<string, number> | undefined;
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;

  // Extract text content — skip tool_use / tool_result blocks so we only
  // process Claude's final synthesised answer.
  const content = researchData?.content;
  if (!Array.isArray(content)) return null;

  const textContent = (content as Array<Record<string, unknown>>)
    .filter((block) => block?.type === 'text')
    .map((block) => String(block?.text ?? ''))
    .join('\n')
    .trim();

  if (!textContent) {
    console.error('Market research returned empty text content');
    return null;
  }

  const findings = parseMarketResearchResponse(textContent);
  return { findings, inputTokens, outputTokens, latencyMs };
}

// ---------------------------------------------------------------------------
// Cost estimation — claude-sonnet-4-5 pricing
// Rates as of 2025-09: Input $3 / million tokens; Output $15 / million tokens.
// These values are specific to the claude-sonnet-4-5-20250929 model.
// If the model or Anthropic pricing changes, update the constants below.
// ---------------------------------------------------------------------------

const COST_PER_MILLION_INPUT_TOKENS = 3; // USD
const COST_PER_MILLION_OUTPUT_TOKENS = 15; // USD

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * COST_PER_MILLION_INPUT_TOKENS +
      outputTokens * COST_PER_MILLION_OUTPUT_TOKENS) /
    1_000_000
  );
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ------------------------------------------------------------------
    // 1. Verify the user is authenticated
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('Missing required Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Create a Supabase client scoped to the requesting user's JWT to
    // authenticate them and resolve their user ID.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 2. Parse and validate the request body
    // ------------------------------------------------------------------
    let body: { extractedText: string; dealType: string; isOCRDerived?: boolean; stream?: boolean };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const { extractedText, dealType, isOCRDerived = false, stream: requestStream = false } = body;

    if (!isString(extractedText) || extractedText.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'extractedText must be a non-empty string' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (dealType !== 'traditional_pe' && dealType !== 'ip_technology') {
      return new Response(
        JSON.stringify({
          error: 'dealType must be "traditional_pe" or "ip_technology"',
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 3. PRD §9.3 edge-case pre-processing
    //    Run all document checks BEFORE calling Claude.
    // ------------------------------------------------------------------
    const edgeCaseFlags: EdgeCaseFlags = {};

    // Edge case 1: very short document
    const wordCount = countWords(extractedText);
    if (wordCount < MIN_WORD_COUNT) {
      edgeCaseFlags.shortDocument = {
        wordCount,
        warning:
          `Document contains only ${wordCount} word${wordCount === 1 ? '' : 's'} ` +
          `(minimum recommended: ${MIN_WORD_COUNT}). Analysis is limited and low-confidence.`,
      };
    }

    // Edge case 3: non-English document
    const { isNonLatin, nonLatinRatio } = detectNonLatinScript(extractedText);
    if (isNonLatin) {
      edgeCaseFlags.languageWarning = {
        nonLatinRatio,
        warning:
          `Document appears to contain significant non-English text ` +
          `(${Math.round(nonLatinRatio * 100)}% non-Latin characters). ` +
          'English documents are recommended. Analysis is proceeding with reduced confidence.',
      };
    }

    // Edge case 6: highly redacted document
    const { count: redactionCount, density: redactionDensity } = countRedactions(extractedText);
    if (redactionDensity === 'moderate' || redactionDensity === 'high') {
      edgeCaseFlags.significantRedactions = {
        redactionCount,
        density: redactionDensity,
        warning:
          `Document contains ${redactionCount} redaction marker(s) (${redactionDensity} density). ` +
          'Confidence in affected scoring dimensions is reduced.',
      };
    }

    // Edge case 7: OCR-derived text
    if (isOCRDerived === true) {
      edgeCaseFlags.ocrUsed = {
        warning:
          'Text was extracted via OCR and may contain recognition errors, ' +
          'especially in financial figures, tables, and proper nouns. ' +
          'Treat specific numbers with additional caution.',
      };
    }

    // Edge case 2: very long document — truncate before sending to Claude
    const { truncated: processedText, wasTruncated, originalCharCount } =
      truncateDocument(extractedText);
    if (wasTruncated) {
      edgeCaseFlags.documentTruncated = {
        originalCharCount,
        truncatedCharCount: processedText.length,
        warning:
          `Document was truncated from ${Math.round(originalCharCount / 1000)}K to ` +
          `${Math.round(processedText.length / 1000)}K characters. ` +
          'Analysis prioritizes the executive summary and risk factors.',
      };
    }

    // Build context flags object to pass into the prompt preamble
    const contextFlags: DocumentContextFlags = {
      isShortDocument: !!edgeCaseFlags.shortDocument,
      wordCount: edgeCaseFlags.shortDocument?.wordCount,
      wasTruncated,
      originalCharCount: wasTruncated ? originalCharCount : undefined,
      isNonEnglish: !!edgeCaseFlags.languageWarning,
      nonLatinRatio: edgeCaseFlags.languageWarning?.nonLatinRatio,
      hasSignificantRedactions: !!edgeCaseFlags.significantRedactions,
      redactionCount: edgeCaseFlags.significantRedactions?.redactionCount,
      redactionDensity: edgeCaseFlags.significantRedactions?.density,
      isOCRDerived: !!edgeCaseFlags.ocrUsed,
    };

    // ------------------------------------------------------------------
    // 3. Enforce daily rate limit (PRD §2.4: max 50 screenings per day)
    // ------------------------------------------------------------------
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Count successful API calls (error_message IS NULL) for this user today (UTC).
    const nowUtc = new Date();
    const startOfTodayUtc = new Date(
      Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate()),
    );

    const DAILY_LIMIT = 50;
    const { count: usageCount, error: usageError } = await adminClient
      .from('api_usage_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('error_message', null)
      .gte('created_at', startOfTodayUtc.toISOString());

    if (!usageError && usageCount !== null && usageCount >= DAILY_LIMIT) {
      const resetAt = new Date(startOfTodayUtc);
      resetAt.setUTCDate(resetAt.getUTCDate() + 1);
      return new Response(
        JSON.stringify({
          error: `Daily screening limit of ${DAILY_LIMIT} reached. Limit resets at ${resetAt.toISOString()}.`,
          resetAt: resetAt.toISOString(),
        }),
        { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 4. Duplicate document detection (PRD §2.4: hash-based cache)
    //    Hash the extracted text and check screening_documents.content_hash.
    //    If a prior screening used the same document, return the cached
    //    ai_response_json without calling the API again.
    // ------------------------------------------------------------------
    const contentHash = await sha256Hex(extractedText);

    const { data: existingDocs } = await adminClient
      .from('screening_documents')
      .select('screening_id')
      .eq('content_hash', contentHash)
      .limit(1);

    if (existingDocs && existingDocs.length > 0) {
      const cachedScreeningId = existingDocs[0].screening_id as string;
      const { data: cachedScreening } = await adminClient
        .from('screenings')
        .select('ai_response_json')
        .eq('id', cachedScreeningId)
        .single();

      if (
        cachedScreening?.ai_response_json &&
        validateISTAnalysis(cachedScreening.ai_response_json)
      ) {
        return new Response(
          JSON.stringify({
            ...cachedScreening.ai_response_json,
            _cached: true,
            _cacheNotice:
              'This document was previously analyzed. Returning cached result to avoid a duplicate API call.',
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ------------------------------------------------------------------
    // 5. Call the Anthropic Claude API
    // ------------------------------------------------------------------
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY environment variable is not set');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const model = 'claude-sonnet-4-5-20250929';
    const analysisDate = new Date().toISOString().slice(0, 10);
    const systemPrompt =
      dealType === 'traditional_pe' ? TRADITIONAL_PE_SYSTEM_PROMPT : IP_TECH_SYSTEM_PROMPT;
    // Use processedText (possibly truncated) and inject context flags into the prompt preamble
    const analysisPrompt = buildAnalysisPrompt(
      processedText,
      dealType as DealType,
      analysisDate,
      contextFlags,
    );

    const requestStartMs = Date.now();

    // ------------------------------------------------------------------
    // 5a. STREAMING MODE — pipe Anthropic tokens to the client via SSE
    //     and run market research after the stream ends.
    //     Activated when the request body contains `"stream": true`.
    // ------------------------------------------------------------------
    if (requestStream) {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();
      const enc = new TextEncoder();

      /** Write one SSE event to the response stream. */
      const sendSse = async (event: Record<string, unknown>): Promise<void> => {
        try {
          await writer.write(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected — ignore write errors.
        }
      };

      // Run the full analysis pipeline asynchronously while the streaming
      // response is delivered to the client.
      (async () => {
        try {
          await sendSse({ type: 'progress', step: 'analyzing', message: 'Running IST analysis…' });

          // ── Call Anthropic with streaming enabled ────────────────────────
          let anthropicStreamResponse: Response;
          try {
            anthropicStreamResponse = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': anthropicApiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model,
                max_tokens: 8192,
                system: systemPrompt,
                messages: [{ role: 'user', content: analysisPrompt }],
                stream: true,
              }),
            });
          } catch (fetchErr) {
            console.error('Streaming: failed to reach Anthropic API:', fetchErr);
            await sendSse({ type: 'error', message: 'Failed to reach AI provider' });
            return;
          }

          if (!anthropicStreamResponse.ok || !anthropicStreamResponse.body) {
            const errText = await anthropicStreamResponse.text().catch(() => '');
            console.error(`Streaming: Anthropic API error ${anthropicStreamResponse.status}:`, errText);
            await logApiUsage({
              supabaseUrl,
              serviceRoleKey: supabaseServiceRoleKey,
              userId: user.id,
              model,
              inputTokens: 0,
              outputTokens: 0,
              costUsd: 0,
              latencyMs: Date.now() - requestStartMs,
              httpStatus: anthropicStreamResponse.status,
              errorMessage: `Anthropic API error ${anthropicStreamResponse.status}: ${errText.slice(0, 500)}`,
            });
            await sendSse({ type: 'error', message: 'AI provider returned an error' });
            return;
          }

          // ── Forward text tokens from Anthropic's SSE stream ─────────────
          const sseReader = anthropicStreamResponse.body.getReader();
          const decoder = new TextDecoder();
          let accumulated = '';
          let sseBuffer = '';
          let inputTokens = 0;
          let outputTokens = 0;

          while (true) {
            const { done, value } = await sseReader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (!raw || raw === '[DONE]') continue;

              try {
                const evt = JSON.parse(raw) as Record<string, unknown>;

                if (evt.type === 'message_start') {
                  const msg = evt.message as { usage?: { input_tokens?: number } } | undefined;
                  inputTokens = msg?.usage?.input_tokens ?? 0;
                } else if (
                  evt.type === 'content_block_delta' &&
                  (evt.delta as Record<string, unknown>)?.type === 'text_delta'
                ) {
                  const text = String((evt.delta as Record<string, unknown>).text ?? '');
                  accumulated += text;
                  await sendSse({ type: 'text_delta', text });
                } else if (evt.type === 'message_delta' && evt.usage) {
                  outputTokens = (evt.usage as Record<string, number>).output_tokens ?? 0;
                }
              } catch {
                // Ignore malformed SSE lines from Anthropic.
              }
            }
          }

          const streamLatencyMs = Date.now() - requestStartMs;
          const httpStatusStream = 200;
          const costUsdStream = estimateCostUsd(inputTokens, outputTokens);

          // ── Parse accumulated JSON ────────────────────────────────────────
          let parsedAnalysis: unknown;
          try {
            const cleaned = accumulated
              .trim()
              .replace(/^```(?:json)?\s*/i, '')
              .replace(/\s*```$/, '');
            parsedAnalysis = JSON.parse(cleaned);
          } catch (parseErr) {
            console.error('Streaming: failed to parse Claude JSON:', parseErr);
            await logApiUsage({
              supabaseUrl,
              serviceRoleKey: supabaseServiceRoleKey,
              userId: user.id,
              model,
              inputTokens,
              outputTokens,
              costUsd: costUsdStream,
              latencyMs: streamLatencyMs,
              httpStatus: httpStatusStream,
              errorMessage: `JSON parse error: ${String(parseErr)}`,
            });
            await sendSse({ type: 'error', message: 'AI provider returned invalid JSON' });
            return;
          }

          if (!validateISTAnalysis(parsedAnalysis)) {
            console.error('Streaming: ISTAnalysis schema validation failed');
            await logApiUsage({
              supabaseUrl,
              serviceRoleKey: supabaseServiceRoleKey,
              userId: user.id,
              model,
              inputTokens,
              outputTokens,
              costUsd: costUsdStream,
              latencyMs: streamLatencyMs,
              httpStatus: httpStatusStream,
              errorMessage: 'ISTAnalysis schema validation failed',
            });
            await sendSse({ type: 'error', message: 'AI response did not conform to the ISTAnalysis schema' });
            return;
          }

          // Log the successful main analysis call.
          await logApiUsage({
            supabaseUrl,
            serviceRoleKey: supabaseServiceRoleKey,
            userId: user.id,
            model,
            inputTokens,
            outputTokens,
            costUsd: costUsdStream,
            latencyMs: streamLatencyMs,
            httpStatus: httpStatusStream,
            errorMessage: null,
          });

          // ── Market research enhancement (PRD §8.3) ───────────────────────
          let finalAnalysis: ISTAnalysis = parsedAnalysis as ISTAnalysis;
          let marketResearchPerformed = false;

          try {
            await sendSse({ type: 'progress', step: 'enriching', message: 'Enhancing with market research…' });

            const validatedAnalysis = parsedAnalysis as ISTAnalysis;
            // Build a brief industry context from the snapshot and top strengths.
            const industryContext = [
              validatedAnalysis.snapshot?.industry ?? '',
              validatedAnalysis.strengths
                ?.slice(0, 2)
                .map((s) => s.description)
                .join(' ') ?? '',
            ]
              .filter(Boolean)
              .join('\n');

            const researchResult = await performMarketResearch(
              anthropicApiKey,
              validatedAnalysis.company_name,
              industryContext,
            );

            if (researchResult) {
              finalAnalysis = injectMarketResearch(validatedAnalysis, researchResult.findings);
              marketResearchPerformed = true;

              await logApiUsage({
                supabaseUrl,
                serviceRoleKey: supabaseServiceRoleKey,
                userId: user.id,
                model: 'claude-sonnet-4-5-20250929',
                inputTokens: researchResult.inputTokens,
                outputTokens: researchResult.outputTokens,
                costUsd: estimateCostUsd(researchResult.inputTokens, researchResult.outputTokens),
                latencyMs: researchResult.latencyMs,
                httpStatus: 200,
                errorMessage: null,
              });
            }
          } catch (researchErr) {
            // Non-fatal — log and proceed with the original analysis.
            console.error('Streaming: market research failed (non-fatal):', researchErr);
          }

          // ── Send final complete event ─────────────────────────────────────
          const hasFlags = Object.keys(edgeCaseFlags).length > 0;
          const responseData: Record<string, unknown> = {
            ...finalAnalysis as Record<string, unknown>,
            ...(hasFlags ? { _flags: edgeCaseFlags } : {}),
            ...(marketResearchPerformed ? { _marketResearch: true } : {}),
          };

          await sendSse({ type: 'complete', data: responseData });
          await sendSse({ type: 'done' });

        } catch (err) {
          console.error('Streaming analysis unexpected error:', err);
          await sendSse({ type: 'error', message: 'Internal server error during analysis' });
        } finally {
          try {
            await writer.close();
          } catch {
            // Already closed.
          }
        }
      })();

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          ...CORS_HEADERS,
        },
      });
    }

    // ------------------------------------------------------------------
    // 5b. NON-STREAMING MODE — existing synchronous behaviour
    // ------------------------------------------------------------------
    let anthropicResponse: Response;

    try {
      anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          // 8 192 tokens is sufficient for the full structured ISTAnalysis JSON
          // output for both Traditional PE and IP/Technology deals (typical
          // responses are 2 000–5 000 tokens). Raise this limit if longer
          // documents or more detailed analyses are required in the future.
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: analysisPrompt }],
        }),
      });
    } catch (fetchError) {
      console.error('Failed to reach Anthropic API:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to reach AI provider' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const latencyMs = Date.now() - requestStartMs;
    const httpStatus = anthropicResponse.status;

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text();
      console.error(`Anthropic API error ${httpStatus}:`, errorBody);

      // Log the failed call before returning
      await logApiUsage({
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey,
        userId: user.id,
        model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        httpStatus,
        errorMessage: `Anthropic API error ${httpStatus}: ${errorBody.slice(0, 500)}`,
      });

      return new Response(
        JSON.stringify({ error: 'AI provider returned an error', details: httpStatus }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 6. Extract and validate the response
    // ------------------------------------------------------------------
    const anthropicData = await anthropicResponse.json();

    const inputTokens: number = anthropicData?.usage?.input_tokens ?? 0;
    const outputTokens: number = anthropicData?.usage?.output_tokens ?? 0;
    const costUsd = estimateCostUsd(inputTokens, outputTokens);

    // Extract the text content from the first content block
    const rawContent: string =
      anthropicData?.content?.[0]?.type === 'text'
        ? anthropicData.content[0].text
        : '';

    if (!rawContent) {
      console.error('Anthropic returned empty content', JSON.stringify(anthropicData));

      await logApiUsage({
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey,
        userId: user.id,
        model,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
        httpStatus,
        errorMessage: 'Anthropic returned empty content',
      });

      return new Response(
        JSON.stringify({ error: 'AI provider returned empty content' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Parse the JSON — Claude may wrap it in a markdown code block
    let parsedAnalysis: unknown;
    try {
      // Strip optional markdown fences (```json ... ```)
      const cleaned = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      parsedAnalysis = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse Claude JSON response:', parseError, rawContent);

      await logApiUsage({
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey,
        userId: user.id,
        model,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
        httpStatus,
        errorMessage: `JSON parse error: ${String(parseError)}`,
      });

      return new Response(
        JSON.stringify({ error: 'AI provider returned invalid JSON' }),
        { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (!validateISTAnalysis(parsedAnalysis)) {
      console.error('ISTAnalysis schema validation failed', JSON.stringify(parsedAnalysis));

      await logApiUsage({
        supabaseUrl,
        serviceRoleKey: supabaseServiceRoleKey,
        userId: user.id,
        model,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
        httpStatus,
        errorMessage: 'ISTAnalysis schema validation failed',
      });

      return new Response(
        JSON.stringify({ error: 'AI response did not conform to the ISTAnalysis schema' }),
        { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // ------------------------------------------------------------------
    // 7. Log the successful API call to api_usage_log
    // ------------------------------------------------------------------
    await logApiUsage({
      supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
      userId: user.id,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      httpStatus,
      errorMessage: null,
    });

    // ------------------------------------------------------------------
    // 8. Market Research Enhancement (PRD §8.3)
    //    Best-effort: a failure here never prevents the main analysis from
    //    being returned. The second Claude call uses the web_search tool to
    //    fetch real-time market data and inject [Web Research]-tagged
    //    findings into the Market Attractiveness (marketOpportunity) and
    //    Competitive Position (companyOverview) score justifications.
    // ------------------------------------------------------------------
    let finalAnalysis: ISTAnalysis = parsedAnalysis as ISTAnalysis;
    let marketResearchPerformed = false;

    try {
      const validatedAnalysis = parsedAnalysis as ISTAnalysis;
      // Build a brief industry context from the snapshot and top strengths.
      const industryContext = [
        validatedAnalysis.snapshot?.industry ?? '',
        validatedAnalysis.strengths
          ?.slice(0, 2)
          .map((s) => s.description)
          .join(' ') ?? '',
      ]
        .filter(Boolean)
        .join('\n');

      const researchResult = await performMarketResearch(
        anthropicApiKey,
        validatedAnalysis.company_name,
        industryContext,
      );

      if (researchResult) {
        finalAnalysis = injectMarketResearch(validatedAnalysis, researchResult.findings);
        marketResearchPerformed = true;

        // Log the second (web research) API call separately.
        await logApiUsage({
          supabaseUrl,
          serviceRoleKey: supabaseServiceRoleKey,
          userId: user.id,
          model: 'claude-sonnet-4-5-20250929',
          inputTokens: researchResult.inputTokens,
          outputTokens: researchResult.outputTokens,
          costUsd: estimateCostUsd(researchResult.inputTokens, researchResult.outputTokens),
          latencyMs: researchResult.latencyMs,
          httpStatus: 200,
          errorMessage: null,
        });
      }
    } catch (researchErr) {
      // Non-fatal: log and proceed with the original analysis.
      console.error('Market research enhancement failed (non-fatal):', researchErr);
    }

    // ------------------------------------------------------------------
    // 9. Return the (possibly enhanced) ISTAnalysis, appending any flags
    // ------------------------------------------------------------------
    const hasFlags = Object.keys(edgeCaseFlags).length > 0;
    const responseBody =
      hasFlags || marketResearchPerformed
        ? {
            ...finalAnalysis,
            ...(hasFlags ? { _flags: edgeCaseFlags } : {}),
            ...(marketResearchPerformed ? { _marketResearch: true } : {}),
          }
        : finalAnalysis;

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error in analyze-deal function:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});

// ---------------------------------------------------------------------------
// api_usage_log helper
// ---------------------------------------------------------------------------

interface LogApiUsageParams {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  httpStatus: number;
  errorMessage: string | null;
}

async function logApiUsage(params: LogApiUsageParams): Promise<void> {
  try {
    const adminClient = createClient(params.supabaseUrl, params.serviceRoleKey);

    const { error } = await adminClient.from('api_usage_log').insert({
      user_id: params.userId,
      provider: 'anthropic',
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_estimate: params.costUsd,
      latency_ms: params.latencyMs,
      http_status: params.httpStatus,
      error_message: params.errorMessage,
    });

    if (error) {
      console.error('Failed to insert api_usage_log record:', error);
    }
  } catch (err) {
    console.error('Unexpected error while logging API usage:', err);
  }
}
