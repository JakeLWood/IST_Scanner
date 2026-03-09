/**
 * IST Scanner — TypeScript type definitions
 *
 * Defines the full shape of the JSON object that Claude returns for an
 * Investment Screening Tool (IST) analysis, together with every supporting
 * interface and union type referenced by that top-level schema.
 */

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** The category of deal being screened. */
export type DealType = 'traditional_pe' | 'ip_technology';

/** The AI-generated verdict attached to a recommendation. */
export type RecommendationVerdict = 'PROCEED' | 'FURTHER_REVIEW' | 'PASS';

// ---------------------------------------------------------------------------
// Building-block interfaces
// ---------------------------------------------------------------------------

/**
 * A single strength identified during the IST analysis.
 */
export interface ISTStrength {
  /** Short, human-readable title for the strength. */
  title: string;
  /** Detailed explanation of why this is considered a strength. */
  description: string;
  /**
   * Relative importance of this strength to the overall investment thesis.
   * Scale: 'low' | 'medium' | 'high'
   */
  significance: 'low' | 'medium' | 'high';
}

/**
 * A single risk or concern identified during the IST analysis.
 */
export interface ISTRisk {
  /** Short, human-readable title for the risk. */
  title: string;
  /** Detailed explanation of the risk and its potential impact. */
  description: string;
  /**
   * How severe the risk is if it materializes.
   * Scale: 'low' | 'medium' | 'high' | 'critical'
   */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /**
   * How likely the risk is to materialize.
   * Scale: 'low' | 'medium' | 'high'
   */
  likelihood: 'low' | 'medium' | 'high';
  /** Suggested actions to mitigate or monitor the risk, if any. */
  mitigation?: string;
}

/**
 * A value-creation lever or opportunity identified during the IST analysis.
 */
export interface ISTValueCreation {
  /** Short, human-readable title for the opportunity. */
  title: string;
  /** Explanation of the opportunity and how value could be created. */
  description: string;
  /**
   * Estimated timeframe to realize the value.
   * Scale: 'short_term' (0-12 months) | 'medium_term' (1-3 years) | 'long_term' (3+ years)
   */
  timeframe: 'short_term' | 'medium_term' | 'long_term';
  /**
   * Magnitude of the potential value uplift.
   * Scale: 'low' | 'medium' | 'high'
   */
  potential: 'low' | 'medium' | 'high';
}

/**
 * Numeric scores for each dimension evaluated during the IST analysis,
 * along with a computed composite score.
 *
 * All individual dimension scores are on a 0–100 scale.
 */
export interface ISTScore {
  /** Weighted composite score across all dimensions (0–100). */
  overall: number;
  /** Score for market size, growth dynamics, and competitive landscape. */
  market: number;
  /** Score for management team quality and depth. */
  management: number;
  /** Score for financial performance, stability, and outlook. */
  financials: number;
  /** Score for strategic fit with the fund's thesis and portfolio. */
  strategic_fit: number;
  /**
   * Score specifically for IP quality and technology defensibility.
   * Only applicable when `deal_type` is `'ip_technology'`; `null` otherwise.
   */
  ip_technology: number | null;
  /**
   * Brief rationale for each dimension score, keyed by dimension name.
   * Mirrors the numeric fields above.
   */
  rationale: {
    overall: string;
    market: string;
    management: string;
    financials: string;
    strategic_fit: string;
    ip_technology: string | null;
  };
}

/**
 * The AI-generated recommendation for the deal.
 */
export interface ISTRecommendation {
  /** Binary / ternary decision on how to proceed with the deal. */
  verdict: RecommendationVerdict;
  /**
   * Concise summary of the rationale behind the verdict (2-5 sentences).
   */
  summary: string;
  /**
   * Ordered list of conditions or actions that must be satisfied before
   * the deal can advance to the next stage (if any).
   */
  conditions: string[];
  /**
   * Whether a hard-stop disqualifier was triggered that overrides the score.
   * When `true` the verdict will always be `'PASS'`.
   */
  is_disqualified: boolean;
  /**
   * Human-readable description of the disqualifier that was triggered,
   * or `null` if no disqualifier applied.
   */
  disqualifier_reason: string | null;
}

/**
 * A key question that requires further investigation before a final
 * investment decision can be made.
 */
export interface ISTKeyQuestion {
  /** The question to be answered. */
  question: string;
  /** Why this question is important to the investment decision. */
  rationale: string;
  /**
   * Priority for resolving this question.
   * Scale: 'low' | 'medium' | 'high'
   */
  priority: 'low' | 'medium' | 'high';
  /** The team, workstream, or external party best placed to answer this. */
  owner?: string;
}

/**
 * Assessment of the quality and completeness of the input data used
 * during the IST analysis.
 */
export interface ISTDataQuality {
  /**
   * Overall confidence in the analysis output given the available data.
   * Scale: 'low' | 'medium' | 'high'
   */
  confidence: 'low' | 'medium' | 'high';
  /**
   * Percentage of the expected data set that was actually available
   * at analysis time (0–100).
   */
  completeness_pct: number;
  /**
   * List of data types or documents that were missing or incomplete.
   * Empty array if nothing is missing.
   */
  missing_data: string[];
  /**
   * Free-text caveats about data limitations that may affect the reliability
   * of specific conclusions.
   */
  caveats: string;
}

// ---------------------------------------------------------------------------
// Snapshot & Screening interfaces
// ---------------------------------------------------------------------------

/**
 * A point-in-time snapshot of an IST analysis result.
 *
 * Snapshots are immutable records stored whenever the AI produces a new
 * analysis version so that historical outputs can be compared or audited.
 */
export interface ISTSnapshot {
  /** Unique identifier for this snapshot (UUID). */
  id: string;
  /** Foreign key referencing the parent `ISTScreening.id`. */
  screening_id: string;
  /** ISO-8601 timestamp when this snapshot was created. */
  created_at: string;
  /**
   * Version counter that increments each time a new analysis is run for
   * the same screening (starts at 1).
   */
  version: number;
  /** Full analysis result captured at this point in time. */
  analysis: ISTAnalysis;
  /** Identifier of the AI model that produced this snapshot. */
  model_id: string;
  /**
   * Total number of tokens consumed during this analysis run
   * (prompt + completion).
   */
  tokens_used: number;
  /** Approximate USD cost of the API call that produced this snapshot. */
  cost_usd: number;
}

/**
 * The top-level screening record that tracks the lifecycle of a deal
 * through the IST process.
 */
export interface ISTScreening {
  /** Unique identifier for this screening (UUID). */
  id: string;
  /** UUID of the user who created the screening. */
  created_by: string;
  /** ISO-8601 timestamp when the screening was first created. */
  created_at: string;
  /** ISO-8601 timestamp of the most recent update to this record. */
  updated_at: string;
  /** Human-readable name of the company or deal being screened. */
  company_name: string;
  /**
   * Category of deal, which determines which scoring dimensions apply
   * and which AI prompt template is used.
   */
  deal_type: DealType;
  /**
   * Current lifecycle status of the screening.
   *
   * - `'pending'`      – created but AI analysis not yet started
   * - `'in_progress'`  – AI analysis is currently running
   * - `'ai_complete'`  – AI has returned a result; awaiting human review
   * - `'approved'`     – human reviewer approved the AI recommendation
   * - `'rejected'`     – human reviewer rejected the deal
   * - `'overridden'`   – human reviewer overrode the AI verdict
   */
  status:
    | 'pending'
    | 'in_progress'
    | 'ai_complete'
    | 'approved'
    | 'rejected'
    | 'overridden';
  /**
   * The most recent AI analysis result, or `null` if no analysis has
   * been run yet.
   */
  latest_analysis: ISTAnalysis | null;
  /** Ordered list of all historical analysis snapshots. */
  snapshots: ISTSnapshot[];
  /**
   * Optional free-text notes added by a human reviewer during the
   * approval / rejection workflow.
   */
  reviewer_notes?: string;
}

// ---------------------------------------------------------------------------
// Top-level Claude response schema
// ---------------------------------------------------------------------------

/**
 * The complete JSON object returned by Claude for a single IST analysis.
 *
 * This is the authoritative schema that the AI prompt instructs Claude to
 * conform to.  Every field is required unless marked optional (`?`).
 */
export interface ISTAnalysis {
  /**
   * Version of the IST analysis schema used to produce this response.
   * Used for forward-compatibility checks (e.g. `"1.0"`).
   */
  schema_version: string;
  /** ISO-8601 timestamp when Claude generated this analysis. */
  generated_at: string;
  /** Name of the company that was analysed. */
  company_name: string;
  /** Category of deal that was analysed. */
  deal_type: DealType;
  /**
   * One-paragraph executive summary of the deal (max ~200 words).
   */
  executive_summary: string;
  /** Strengths identified during the analysis, ordered by significance. */
  strengths: ISTStrength[];
  /** Risks identified during the analysis, ordered by severity. */
  risks: ISTRisk[];
  /** Value-creation opportunities identified during the analysis. */
  value_creation: ISTValueCreation[];
  /** Dimension-level and composite numeric scores. */
  score: ISTScore;
  /** AI recommendation and verdict. */
  recommendation: ISTRecommendation;
  /**
   * Key questions that must be answered before advancing the deal.
   * Empty array if no outstanding questions remain.
   */
  key_questions: ISTKeyQuestion[];
  /** Assessment of the completeness and reliability of the input data. */
  data_quality: ISTDataQuality;
}
