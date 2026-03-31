/**
 * IST Screener — TypeScript type definitions
 *
 * Defines the full shape of the JSON object that Claude returns for an
 * Investment Screening Test (IST) analysis, as specified in PRD §5.4.
 *
 * The developer must validate all Claude responses against these types and
 * retry with a correction prompt on schema violations (PRD §5.4).
 */

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** The category of deal being screened (PRD §4.3). */
export type DealType = 'traditional_pe' | 'ip_technology';

/**
 * The AI-generated verdict attached to a recommendation (PRD §3.6).
 * - PROCEED    — composite score 7.5–10.0
 * - FURTHER_REVIEW — composite score 5.5–7.4
 * - PASS       — composite score < 5.5, or a hard disqualifier was triggered
 */
export type RecommendationVerdict = 'PROCEED' | 'FURTHER_REVIEW' | 'PASS';

/** Severity scale used in risk assessments (PRD §5.2). */
export type RiskSeverity = 'High' | 'Medium' | 'Low';

// ---------------------------------------------------------------------------
// §3.1 / §5.2 — Investment Snapshot
// Quick-reference header extracted from the uploaded document.
// ---------------------------------------------------------------------------

/**
 * Extracted factual data about the company being screened.
 * Corresponds to IST Output Section I (PRD §3.1).
 */
export interface ISTSnapshot {
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

// ---------------------------------------------------------------------------
// §3.2 / §5.2 — Investment Strengths
// Corresponds to IST Output Section II (PRD §3.1).
// ---------------------------------------------------------------------------

/**
 * A single investment strength identified during the IST analysis (PRD §5.4).
 * Each strength must cite specific data from the document.
 */
export interface ISTStrength {
  /** Categorical grouping (e.g., "Market Position", "Financial Profile"). */
  category: string;
  /** Short, human-readable title for the strength. */
  title: string;
  /** Detailed explanation of why this is considered a strength. */
  description: string;
  /**
   * Array of specific data points from the source document that support this
   * strength (numbers, percentages, customer names, product details).
   */
  supporting_data: string[];
}

// ---------------------------------------------------------------------------
// §5.2 / §5.3 — Strategic Considerations (Risks)
// Corresponds to IST Output Section III (PRD §3.1).
// ---------------------------------------------------------------------------

/**
 * A single risk or concern identified during the IST analysis (PRD §5.4).
 * Every risk must include a severity rating and proposed mitigation.
 */
export interface ISTRisk {
  /** Short, human-readable description of the risk. */
  risk: string;
  /** How severe the risk is if it materializes. */
  severity: RiskSeverity;
  /**
   * Suggested actions or factors that mitigate this risk.
   * Should be based on evidence in the document — not assumed.
   */
  mitigation: string;
  /**
   * Supporting evidence from the source document (or lack thereof).
   * If the document claims a risk is mitigated but provides no evidence,
   * Claude must note that here and rate severity higher.
   */
  evidence: string;
}

// ---------------------------------------------------------------------------
// §5.2 / §5.3 — Value Creation Thesis
// Corresponds to IST Output Section IV (PRD §3.1).
// ---------------------------------------------------------------------------

/** A single value-creation initiative with estimated financial impact. */
export interface ISTValueCreationInitiative {
  /** Brief description of the initiative. */
  initiative: string;
  /** Low-end EBITDA impact estimate (USD). */
  ebitda_impact_low: number | null;
  /** High-end EBITDA impact estimate (USD). */
  ebitda_impact_high: number | null;
  /** Estimated investment required to execute (USD). */
  investment_required: number | null;
  /** Expected execution timeline (e.g., "Q1–Q3 Year 1"). */
  timeline: string;
}

/**
 * Value creation thesis grouped by time horizon (PRD §5.4).
 * Corresponds to IST Output Section IV (PRD §3.1).
 */
export interface ISTValueCreation {
  /** Near-term opportunities (12–24 months post-acquisition). */
  near_term: ISTValueCreationInitiative[];
  /** Medium-term opportunities (24–36 months post-acquisition). */
  medium_term: ISTValueCreationInitiative[];
  /** Strategic exit positioning opportunities. */
  exit_positioning: ISTValueCreationInitiative[];
}

// ---------------------------------------------------------------------------
// §3.2–3.4 / §5.2 — Dimension Scores
// Corresponds to IST Output Section V (PRD §3.1).
// ---------------------------------------------------------------------------

/**
 * Score for a single screening dimension (PRD §5.4).
 * All dimensions are scored on a 1–10 scale (PRD §3.2).
 * - 7–10: strong/excellent
 * - 5–6:  adequate/mixed
 * - 3–4:  concerning
 * - 1–2:  deal-breaking weakness
 * - null: insufficient data to score
 *
 * Traditional PE dimensions (PRD §3.2–3.3):
 *   market_attractiveness, competitive_position, management_team,
 *   customer_quality, value_creation_potential, risk_profile,
 *   strategic_fit, financial_quality, valuation_attractiveness,
 *   transaction_feasibility
 *
 * IP / Technology dimensions (PRD §3.2 + §3.4):
 *   market_attractiveness, competitive_position, management_team,
 *   customer_quality, value_creation_potential, risk_profile,
 *   strategic_fit, technology_readiness, ip_strength_defensibility,
 *   commercialization_pathway, orthogonal_application_potential
 */
export interface ISTDimensionScore {
  /** Dimension identifier (e.g., "market_attractiveness"). */
  dimension: string;
  /**
   * Score from 1–10, or null if there is insufficient data.
   * A score of null must always include a data_gaps entry.
   */
  score: number | null;
  /** 2–3 sentence justification for the score. */
  justification: string;
  /** Fields or documents that would be needed to improve this score. */
  data_gaps: string[];
}

// ---------------------------------------------------------------------------
// §3.6 / §5.4 — Recommendation
// Corresponds to IST Output Section VI (PRD §3.1).
// ---------------------------------------------------------------------------

/**
 * The AI-generated recommendation for the deal (PRD §5.4).
 */
export interface ISTRecommendation {
  /** Binary/ternary decision on how to proceed with the deal. */
  verdict: RecommendationVerdict;
  /**
   * 3–5 bullet justification for the verdict.
   * Each element is one concise bullet point.
   */
  reasoning: string[];
  /**
   * Suggested LOI terms if verdict is PROCEED (PRD §3.6).
   * null for FURTHER_REVIEW and PASS verdicts.
   */
  suggested_loi_terms: string | null;
  /**
   * Specific disqualifying factors if verdict is PASS (PRD §3.6).
   * null for PROCEED and FURTHER_REVIEW verdicts.
   */
  disqualifying_factors: string[] | null;
}

// ---------------------------------------------------------------------------
// §5.2 / §5.4 — Key Questions
// Corresponds to IST Output Section VII (PRD §3.1).
// ---------------------------------------------------------------------------

/**
 * A question the deal team should ask management or the intermediary.
 * PRD §5.2: each question targets a specific risk, validates a key assumption,
 * or fills a data gap identified during the analysis.
 */
export interface ISTKeyQuestion {
  /** The question to be answered. */
  question: string;
  /**
   * Parenthetical noting which risk, thesis element, or assumption this
   * question validates (PRD §5.2).
   */
  validates: string;
}

// ---------------------------------------------------------------------------
// §5.4 — Data Quality
// ---------------------------------------------------------------------------

/**
 * Assessment of the quality and completeness of the input data.
 */
export interface ISTDataQuality {
  /**
   * Percentage of expected data fields that were available at analysis time
   * (0–100).
   */
  completeness_pct: number;
  /**
   * Critical fields (revenue, EBITDA, etc.) that were absent from the source
   * document and could not be inferred.
   */
  missing_critical_fields: string[];
  /**
   * Free-text caveats about data limitations that may affect the reliability
   * of specific conclusions. One element per distinct caveat.
   */
  caveats: string[];
}

// ---------------------------------------------------------------------------
// §5.4 — Top-level Claude response schema
// ---------------------------------------------------------------------------

/**
 * The complete JSON object returned by Claude for a single IST analysis.
 * This is the authoritative schema that the AI prompt instructs Claude to
 * conform to (PRD §5.4).
 *
 * The developer must define this as a TypeScript interface and validate all
 * Claude responses against it. Invalid responses should trigger a retry with
 * a correction prompt (PRD §5.4).
 */
export interface ISTAnalysis {
  /**
   * Version of the IST analysis schema (e.g., "1.0").
   * Used for forward-compatibility checks.
   */
  schema_version: string;
  /** ISO-8601 timestamp when Claude generated this analysis. */
  generated_at: string;
  /** Name of the company analysed. */
  company_name: string;
  /** Category of deal analysed — determines the scoring framework applied. */
  deal_type: DealType;
  /**
   * Extracted factual data about the company (IST Section I).
   * All financial figures in USD.
   */
  snapshot: ISTSnapshot;
  /**
   * 3–6 investment strengths, each with supporting data (IST Section II).
   */
  strengths: ISTStrength[];
  /**
   * Risk/mitigation table with severity ratings (IST Section III).
   */
  risks: ISTRisk[];
  /**
   * Value creation thesis grouped by time horizon (IST Section IV).
   */
  value_creation: ISTValueCreation;
  /**
   * Per-dimension scores on a 1–10 scale (IST Section V).
   * Array length and dimension names vary by deal_type.
   */
  scores: ISTDimensionScore[];
  /**
   * Final recommendation with reasoning (IST Section VI).
   */
  recommendation: ISTRecommendation;
  /**
   * 5–10 targeted questions for the deal team (IST Section VII).
   */
  key_questions: ISTKeyQuestion[];
  /**
   * Assessment of completeness and reliability of input data.
   */
  data_quality: ISTDataQuality;
}

// ---------------------------------------------------------------------------
// Screening metadata — caller-supplied context attached to a new screening
// ---------------------------------------------------------------------------

/**
 * Optional metadata the caller provides when saving a new screening record.
 * These fields supplement the AI-extracted data.
 */
export interface ScreeningMetadata {
  /**
   * Where the deal was sourced from (e.g. "Investment Bank / Advisor").
   * Stored in `screenings.deal_source`.
   */
  dealSource?: string | null;
  /**
   * Overrides the company name extracted by Claude.
   * When blank the name from `ISTAnalysis.company_name` is used.
   */
  dealNameOverride?: string | null;
  /** Free-text reviewer notes stored in `screenings.notes`. */
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Database / lifecycle types
// ---------------------------------------------------------------------------

/**
 * A point-in-time snapshot of an IST analysis result stored for audit
 * and comparison purposes.
 */
export interface ISTAnalysisSnapshot {
  /** Unique identifier for this snapshot (UUID). */
  id: string;
  /** Foreign key referencing the parent screening record. */
  screening_id: string;
  /** ISO-8601 timestamp when this snapshot was created. */
  created_at: string;
  /** Version counter (starts at 1, increments on re-analysis). */
  version: number;
  /** Full analysis result captured at this point in time. */
  analysis: ISTAnalysis;
  /** Identifier of the AI model that produced this snapshot. */
  model_id: string;
  /** Total tokens consumed (prompt + completion). */
  tokens_used: number;
  /** Approximate USD cost of the API call. */
  cost_estimate: number;
}

/**
 * The top-level screening record that tracks the lifecycle of a deal
 * through the IST process (mirrors the `screenings` database table).
 */
export interface ISTScreeningRecord {
  /** Unique identifier for this screening (UUID). */
  id: string;
  /** UUID of the user who created the screening (PRD §7.1: user_id). */
  user_id: string;
  /** ISO-8601 timestamp when the screening was first created. */
  created_at: string;
  /** ISO-8601 timestamp of the most recent update to this record. */
  updated_at: string;
  /** Human-readable name of the company or deal being screened. */
  company_name: string;
  /** Category of deal, determining which scoring framework is applied. */
  deal_type: DealType | null;
  /** Where the deal was sourced from (broker, referral, etc.). */
  deal_source: string | null;
  /**
   * Weighted composite score (1.0–10.0).
   * null before AI analysis is complete.
   */
  composite_score: number | null;
  /**
   * AI-generated recommendation verdict.
   * null before AI analysis is complete.
   */
  recommendation: RecommendationVerdict | null;
  /** Raw text extracted from the uploaded document. */
  raw_document_text: string | null;
  /** Complete JSON response from Claude. */
  ai_response_json: ISTAnalysis | null;
  /** Computed dimension scores stored for fast querying. */
  scores_json: ISTDimensionScore[] | null;
  /** Extracted investment snapshot stored for fast querying. */
  snapshot_json: ISTSnapshot | null;
  /** Optional notes added by a reviewer. */
  notes: string | null;
  /** Whether a hard disqualifier was triggered. */
  is_disqualified: boolean;
  /** IDs of disqualifier rules that were triggered. */
  disqualifier_ids: string[];
}
