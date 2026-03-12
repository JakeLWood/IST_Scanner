/**
 * IST Scoring Engine
 *
 * Accepts an ISTAnalysis JSON and a ScoringConfig, then:
 *   1. Validates that dimension weights sum to 100 %.
 *   2. Computes the weighted composite score (1.0–10.0).
 *   3. Checks any hard disqualifier rules against the analysis fields.
 *   4. Applies configurable PROCEED / FURTHER_REVIEW / PASS thresholds.
 *   5. Returns the composite score and final recommendation.
 */

import type { ISTAnalysis } from "../types/ist-analysis";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The seven IST dimension keys that map to sections in ISTAnalysis. */
export type ISTDimension =
  | "companyOverview"
  | "marketOpportunity"
  | "financialProfile"
  | "managementTeam"
  | "investmentThesis"
  | "riskAssessment"
  | "dealDynamics";

/**
 * Per-dimension weight mapping.
 * Each value is a percentage (0–100); all seven values must sum to exactly 100.
 */
export type DimensionWeights = Record<ISTDimension, number>;

/**
 * Score thresholds that determine the final recommendation bucket.
 *
 * Default values:
 *   proceed      = 7.5  (score >= 7.5  → PROCEED)
 *   furtherReview = 5.5 (score >= 5.5  → FURTHER_REVIEW, below → PASS)
 */
export interface ScoringThresholds {
  /** Minimum composite score required for a PROCEED recommendation. */
  proceed: number;
  /** Minimum composite score required for a FURTHER_REVIEW recommendation. */
  furtherReview: number;
}

/**
 * Comparison operators used in hard disqualifier rules.
 *
 *   lt  – field value is strictly less than rule value
 *   lte – field value is less than or equal to rule value
 *   gt  – field value is strictly greater than rule value
 *   gte – field value is greater than or equal to rule value
 *   eq  – field value equals rule value
 *   neq – field value does not equal rule value
 */
export type DisqualifierCondition = "lt" | "lte" | "gt" | "gte" | "eq" | "neq";

/**
 * A single hard disqualifier rule.
 *
 * If the condition evaluates to `true` for the specified field the deal is
 * immediately disqualified regardless of the composite score.
 */
export interface HardDisqualifier {
  /**
   * Dot-separated path to the field inside ISTAnalysis.
   * Example: `"financialProfile.score"` or `"dealDynamics.score"`.
   */
  field: string;
  /** How to compare the field value against `value`. */
  condition: DisqualifierCondition;
  /** The threshold value to compare the field against. */
  value: number | string;
  /** Human-readable explanation shown when this disqualifier fires. */
  reason: string;
}

/**
 * Full configuration object passed to {@link scoreAnalysis}.
 *
 * Only `weights` is required; `thresholds` and `hardDisqualifiers` fall back
 * to their defaults when omitted.
 */
export interface ScoringConfig {
  /**
   * Percentage weight for each of the seven IST dimensions.
   * All seven values must sum to exactly 100 (validated at runtime).
   */
  weights: DimensionWeights;
  /**
   * Optional override for the PROCEED / FURTHER_REVIEW score thresholds.
   * Unspecified keys retain their default values.
   */
  thresholds?: Partial<ScoringThresholds>;
  /**
   * Optional list of hard disqualifier rules evaluated before the score
   * thresholds. The first matching rule short-circuits evaluation and forces
   * a PASS recommendation.
   */
  hardDisqualifiers?: HardDisqualifier[];
}

/** The three possible final recommendations produced by the scoring engine. */
export type FinalRecommendation = "PROCEED" | "FURTHER_REVIEW" | "PASS";

/** Output returned by {@link scoreAnalysis}. */
export interface ScoringResult {
  /** Weighted composite score, clamped to [1.0, 10.0] and rounded to 1 d.p. */
  compositeScore: number;
  /** Final recommendation based on score thresholds and hard disqualifiers. */
  recommendation: FinalRecommendation;
  /** Whether a hard disqualifier rule was triggered. */
  isDisqualified: boolean;
  /** Human-readable reason for disqualification (present only when `isDisqualified` is `true`). */
  disqualifierReason?: string;
  /** Per-dimension raw scores extracted from the analysis. */
  dimensionScores: Record<ISTDimension, number>;
  /** Per-dimension weights used in the calculation (mirrors `config.weights`). */
  dimensionWeights: DimensionWeights;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default weighted configuration used when no custom weights are supplied. */
export const DEFAULT_WEIGHTS: DimensionWeights = {
  companyOverview: 15,
  marketOpportunity: 20,
  financialProfile: 20,
  managementTeam: 15,
  investmentThesis: 15,
  riskAssessment: 10,
  dealDynamics: 5,
};

/** Default score thresholds. */
export const DEFAULT_THRESHOLDS: ScoringThresholds = {
  proceed: 7.5,
  furtherReview: 5.5,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DIMENSIONS: ISTDimension[] = [
  "companyOverview",
  "marketOpportunity",
  "financialProfile",
  "managementTeam",
  "investmentThesis",
  "riskAssessment",
  "dealDynamics",
];

/**
 * Validates that every dimension has a non-negative weight and that the
 * weights sum to 100 within a small floating-point tolerance.
 *
 * @throws {Error} if any weight is negative or if the sum deviates from 100
 *                 by more than 0.01 percentage points.
 */
function validateWeights(weights: DimensionWeights): void {
  let total = 0;
  for (const dim of DIMENSIONS) {
    const w = weights[dim];
    if (w < 0) {
      throw new Error(
        `Weight for dimension '${dim}' must be >= 0; got ${w}.`,
      );
    }
    total += w;
  }
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(
      `Dimension weights must sum to 100; current sum is ${total.toFixed(4)}.`,
    );
  }
}

/**
 * Reads a dot-separated field path from a plain object tree.
 * Returns `undefined` if any segment along the path is missing or non-object.
 */
function getFieldValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluates a single hard disqualifier rule against the analysis object.
 * Returns `true` when the rule condition is satisfied (i.e. the deal should
 * be disqualified).
 */
function evaluateDisqualifier(
  analysis: ISTAnalysis,
  rule: HardDisqualifier,
): boolean {
  const fieldValue = getFieldValue(analysis, rule.field);
  const { condition, value } = rule;

  if (typeof fieldValue === "number" && typeof value === "number") {
    switch (condition) {
      case "lt":  return fieldValue < value;
      case "lte": return fieldValue <= value;
      case "gt":  return fieldValue > value;
      case "gte": return fieldValue >= value;
      case "eq":  return fieldValue === value;
      case "neq": return fieldValue !== value;
    }
  }

  if (typeof fieldValue === "string" && typeof value === "string") {
    switch (condition) {
      case "eq":  return fieldValue === value;
      case "neq": return fieldValue !== value;
      default:    return false; // lt/lte/gt/gte not meaningful for strings
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scores an IST analysis and returns a final recommendation.
 *
 * @param analysis - The `ISTAnalysis` JSON produced by Claude.
 * @param config   - Scoring configuration: dimension weights (required),
 *                   optional score thresholds, and optional hard disqualifiers.
 *
 * @returns A {@link ScoringResult} containing the weighted composite score
 *          (1.0–10.0), the final recommendation, and supporting metadata.
 *
 * @throws {Error} if `config.weights` do not sum to 100 %.
 *
 * @example
 * ```typescript
 * const result = scoreAnalysis(analysis, {
 *   weights: {
 *     companyOverview:   15,
 *     marketOpportunity: 20,
 *     financialProfile:  20,
 *     managementTeam:    15,
 *     investmentThesis:  15,
 *     riskAssessment:    10,
 *     dealDynamics:       5,
 *   },
 *   thresholds: { proceed: 7.5, furtherReview: 5.5 },
 *   hardDisqualifiers: [
 *     {
 *       field: "financialProfile.score",
 *       condition: "lte",
 *       value: 2,
 *       reason: "Financial profile is deal-breaking (score ≤ 2).",
 *     },
 *   ],
 * });
 * // result.recommendation === "PROCEED" | "FURTHER_REVIEW" | "PASS"
 * ```
 */
export function scoreAnalysis(
  analysis: ISTAnalysis,
  config: ScoringConfig,
): ScoringResult {
  const {
    weights,
    thresholds: partialThresholds,
    hardDisqualifiers = [],
  } = config;

  // 1. Validate weights
  validateWeights(weights);

  // 2. Merge caller-supplied thresholds with defaults
  const thresholds: ScoringThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...partialThresholds,
  };

  // 3. Extract per-dimension scores from the analysis
  const dimensionScores: Record<ISTDimension, number> = {
    companyOverview:   analysis.companyOverview.score,
    marketOpportunity: analysis.marketOpportunity.score,
    financialProfile:  analysis.financialProfile.score,
    managementTeam:    analysis.managementTeam.score,
    investmentThesis:  analysis.investmentThesis.score,
    riskAssessment:    analysis.riskAssessment.score,
    dealDynamics:      analysis.dealDynamics.score,
  };

  // 4. Compute weighted composite score
  let raw = 0;
  for (const dim of DIMENSIONS) {
    raw += (dimensionScores[dim] * weights[dim]) / 100;
  }
  // Clamp to [1.0, 10.0] and round to one decimal place
  const compositeScore = Math.round(Math.min(10, Math.max(1, raw)) * 10) / 10;

  // 5. Check hard disqualifiers (first match wins)
  let isDisqualified = false;
  let disqualifierReason: string | undefined;

  for (const rule of hardDisqualifiers) {
    if (evaluateDisqualifier(analysis, rule)) {
      isDisqualified = true;
      disqualifierReason = rule.reason;
      break;
    }
  }

  // 6. Determine final recommendation
  let recommendation: FinalRecommendation;
  if (isDisqualified) {
    recommendation = "PASS";
  } else if (compositeScore >= thresholds.proceed) {
    recommendation = "PROCEED";
  } else if (compositeScore >= thresholds.furtherReview) {
    recommendation = "FURTHER_REVIEW";
  } else {
    recommendation = "PASS";
  }

  return {
    compositeScore,
    recommendation,
    isDisqualified,
    ...(disqualifierReason !== undefined && { disqualifierReason }),
    dimensionScores,
    dimensionWeights: weights,
  };
}
