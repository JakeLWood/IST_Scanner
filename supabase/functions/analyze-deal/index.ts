import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types (mirrors types/ist-analysis.ts — kept inline so the Edge Function is
// self-contained without a build step)
// ---------------------------------------------------------------------------

/**
 * Score range for any IST section (1–10 integer).
 * Scoring calibration:
 *   7–10 = Strong   (genuine positive supporting the thesis)
 *   5–6  = Adequate (meets baseline expectations; no material concerns)
 *   3–4  = Concerning (warrants significant further diligence)
 *   1–2  = Deal-breaking (fundamental flaw; makes the investment inadvisable)
 */
type ISTScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface ISTSection {
  score: ISTScore;
  commentary: string;
  keyFindings: string[];
}

interface ISTSectionWithName extends ISTSection {
  sectionName: string;
}

/** Aggregate recommendation produced by the scoring engine. */
type ISTRecommendation = 'proceed' | 'conditional_proceed' | 'pass';

/** The deal-type track analysed. */
type DealType = 'traditional_pe' | 'ip_technology';

/**
 * Complete Investment Screening Tool analysis.
 * Claude must return a JSON object that exactly matches this interface.
 * Mirrors types/ist-analysis.ts in the main project.
 */
interface ISTAnalysis {
  companyName: string;
  analysisDate: string;
  dealType: DealType;
  companyOverview: ISTSectionWithName;
  marketOpportunity: ISTSectionWithName;
  financialProfile: ISTSectionWithName;
  managementTeam: ISTSectionWithName;
  investmentThesis: ISTSectionWithName;
  riskAssessment: ISTSectionWithName;
  dealDynamics: ISTSectionWithName;
  overallScore: number;
  recommendation: ISTRecommendation;
  executiveSummary: string;
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

  if (dealType === 'traditional_pe') {
    return `${preamble}\
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

  // IP / Technology Commercialization track
  return `${preamble}\
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
higher TRL levels or at commercial scale; \
(2) IP risk — risk of patent invalidation, adverse IPR / PGR proceedings, FTO issues \
with third-party patents, or inadequate trade-secret protection; \
(3) Commercialization / market adoption risk — risk that target customers do not adopt \
the technology at projected rates; \
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
transactions, technology licensing multiples, and strategic acquirer precedents. \
(2) DEAL STRUCTURE — Assess the proposed investment instrument (equity, convertible, \
royalty-backed financing, milestone-contingent tranches) and its alignment with the \
technology's risk-reward profile. \
(3) RETURN PROFILE — Model the target MOIC and IRR across the primary commercialization \
pathway and the orthogonal-application upside scenario. \
(4) PROCESS — Characterize the deal process (proprietary, lightly competitive, broadly \
marketed) and any timing pressures.>",
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

// ---------------------------------------------------------------------------
// ISTAnalysis schema validation
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate that a value is a valid ISTScore integer (1–10). */
function isISTScore(v: unknown): v is ISTScore {
  return (
    typeof v === 'number' &&
    Number.isInteger(v) &&
    v >= 1 &&
    v <= 10
  );
}

/** Validate a single IST section object. */
function validateISTSection(s: unknown): s is ISTSectionWithName {
  if (!isObject(s)) return false;
  if (!isString(s.sectionName)) return false;
  if (!isISTScore(s.score)) return false;
  if (!isString(s.commentary)) return false;
  if (!isArray(s.keyFindings)) return false;
  for (const f of s.keyFindings) {
    if (!isString(f)) return false;
  }
  return true;
}

function validateISTAnalysis(data: unknown): data is ISTAnalysis {
  if (!isObject(data)) return false;

  // Top-level scalar fields
  if (!isString(data.companyName)) return false;
  if (!isString(data.analysisDate)) return false;
  if (data.dealType !== 'traditional_pe' && data.dealType !== 'ip_technology')
    return false;

  // Seven IST sections
  if (!validateISTSection(data.companyOverview)) return false;
  if (!validateISTSection(data.marketOpportunity)) return false;
  if (!validateISTSection(data.financialProfile)) return false;
  if (!validateISTSection(data.managementTeam)) return false;
  if (!validateISTSection(data.investmentThesis)) return false;
  if (!validateISTSection(data.riskAssessment)) return false;
  if (!validateISTSection(data.dealDynamics)) return false;

  // Aggregate outputs
  if (!isNumber(data.overallScore)) return false;
  if (
    data.recommendation !== 'proceed' &&
    data.recommendation !== 'conditional_proceed' &&
    data.recommendation !== 'pass'
  )
    return false;
  if (!isString(data.executiveSummary)) return false;

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

  // ── marketOpportunity (Market Attractiveness) ─────────────────────────────
  const marketInserts: string[] = [];
  if (findings.marketAndGrowth) {
    marketInserts.push(`[Web Research] Market Size & Growth: ${findings.marketAndGrowth}`);
  }
  if (findings.comparableTransactions) {
    marketInserts.push(`[Web Research] Comparable Transactions: ${findings.comparableTransactions}`);
  }

  if (marketInserts.length > 0) {
    const sourcesNote = buildSourcesNote(findings.sources, 3);
    enhanced.marketOpportunity = {
      ...analysis.marketOpportunity,
      commentary:
        analysis.marketOpportunity.commentary +
        '\n\n' +
        marketInserts.join('\n\n') +
        sourcesNote,
      keyFindings: [
        ...analysis.marketOpportunity.keyFindings,
        ...marketInserts,
      ],
    };
  }

  // ── companyOverview (Competitive Position) ────────────────────────────────
  if (findings.competitiveLandscape) {
    const insert = `[Web Research] Competitive Landscape: ${findings.competitiveLandscape}`;
    const sourcesNote = buildSourcesNote(findings.sources, 2);
    enhanced.companyOverview = {
      ...analysis.companyOverview,
      commentary:
        analysis.companyOverview.commentary +
        '\n\n' +
        insert +
        sourcesNote,
      keyFindings: [
        ...analysis.companyOverview.keyFindings,
        insert,
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
            const industryContext = [
              validatedAnalysis.marketOpportunity.commentary.slice(0, 250),
              validatedAnalysis.companyOverview.commentary.slice(0, 250),
            ]
              .filter(Boolean)
              .join('\n');

            const researchResult = await performMarketResearch(
              anthropicApiKey,
              validatedAnalysis.companyName,
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
      // Build a brief industry context from the two most relevant sections.
      const industryContext = [
        validatedAnalysis.marketOpportunity.commentary.slice(0, 250),
        validatedAnalysis.companyOverview.commentary.slice(0, 250),
      ]
        .filter(Boolean)
        .join('\n');

      const researchResult = await performMarketResearch(
        anthropicApiKey,
        validatedAnalysis.companyName,
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
