/**
 * scripts/validate-scoring.ts
 *
 * Prompt-validation test suite for the IST scoring engine.
 *
 * Verifies that the scoring engine and PRD-defined rules behave correctly
 * against synthetic data — no historical deals or external services required.
 *
 * Test groups:
 *   1. Recommendation thresholds  — PRD §3.6
 *        PROCEED >= 7.5 | FURTHER_REVIEW 5.5–7.4 | PASS < 5.5
 *   2. Hard disqualifiers         — PRD §3.6
 *        All five automatic-PASS rules fire regardless of composite score
 *   3. Null score redistribution  — PRD §4.2.2 / §3.6
 *        Missing dimension scores are excluded (not zeroed), redistributing
 *        weight to non-null dimensions
 *   4. Weight integrity           — PRD §3.5
 *        PE track and IP/Tech track weights each sum to exactly 100 %
 *
 * Run:
 *   npm run validate:scoring
 */

import { describe, it, expect } from "vitest";
import {
  scoreAnalysis,
  computeCompositeScore,
  DEFAULT_WEIGHTS,
  type DimensionWeights,
  type HardDisqualifier,
} from "../lib/scoringEngine";
import type { ISTAnalysis, ISTScore } from "../types/ist-analysis";
import type { ISTDimensionScore } from "../types/ist";

// ---------------------------------------------------------------------------
// PRD §3.5 weight tables (kept in sync with the PRD — not the engine defaults)
// ---------------------------------------------------------------------------

/** Traditional PE track — PRD §3.5, 10 dimensions. */
const PRD_PE_WEIGHTS: Record<string, number> = {
  financial_quality: 20,
  market_attractiveness: 15,
  value_creation_potential: 15,
  competitive_position: 12,
  customer_quality: 10,
  risk_profile: 10,
  strategic_fit: 8,
  valuation_attractiveness: 5,
  transaction_feasibility: 3,
  management_team: 2,
};

/** IP / Technology Commercialization track — PRD §3.5, 10 dimensions. */
const PRD_IP_TECH_WEIGHTS: Record<string, number> = {
  technology_readiness: 18,
  ip_strength_defensibility: 16,
  market_attractiveness: 15,
  commercialization_pathway: 14,
  orthogonal_application_potential: 12,
  competitive_position: 8,
  value_creation_potential: 7,
  risk_profile: 5,
  strategic_fit: 3,
  management_team: 2,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal ISTSection-shaped object. */
function makeSection(sectionName: string, score: ISTScore) {
  return { sectionName, score, commentary: "Test commentary.", keyFindings: ["Test finding"] };
}

/** Build a fully-valid ISTAnalysis with every dimension at `score`. */
function makeAnalysis(score: ISTScore): ISTAnalysis {
  return {
    companyName: "Test Corp",
    analysisDate: "2026-01-01",
    dealType: "traditional_pe",
    companyOverview: makeSection("Company Overview", score) as ISTAnalysis["companyOverview"],
    marketOpportunity: makeSection("Market Opportunity", score) as ISTAnalysis["marketOpportunity"],
    financialProfile: makeSection("Financial Profile", score) as ISTAnalysis["financialProfile"],
    managementTeam: makeSection("Management Team", score) as ISTAnalysis["managementTeam"],
    investmentThesis: makeSection("Investment Thesis", score) as ISTAnalysis["investmentThesis"],
    riskAssessment: makeSection("Risk Assessment", score) as ISTAnalysis["riskAssessment"],
    dealDynamics: makeSection("Deal Dynamics", score) as ISTAnalysis["dealDynamics"],
    overallScore: score,
    recommendation: "conditional_proceed",
    executiveSummary: "Test executive summary.",
  };
}

/**
 * Build an ISTAnalysis-like object that carries an extra `snapshot` property
 * used by HardDisqualifier field paths.
 *
 * The scoring engine's `getFieldValue` traverses any dot-path on the plain
 * JavaScript object, so the extra properties are resolved at runtime even
 * though they are not part of the TypeScript type.
 */
function makeAnalysisWithSnapshot(
  score: ISTScore,
  snapshotData: Record<string, unknown>,
): ISTAnalysis {
  return { ...makeAnalysis(score), snapshot: snapshotData } as unknown as ISTAnalysis;
}

/** Build a minimal ISTDimensionScore for computeCompositeScore tests. */
function makeDimScore(score: number | null, dimension = "test_dim"): ISTDimensionScore {
  return {
    dimension,
    score,
    justification: "Test justification.",
    data_gaps: score === null ? ["Insufficient data to score this dimension."] : [],
  };
}

/** Sum all values in a plain weight map. */
function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((acc, w) => acc + w, 0);
}

// ---------------------------------------------------------------------------
// 1. Recommendation Thresholds — PRD §3.6
// ---------------------------------------------------------------------------

describe("PRD §3.6 — Recommendation Thresholds", () => {
  it("returns PROCEED when composite score >= 7.5 (all dimensions at 8)", () => {
    const result = scoreAnalysis(makeAnalysis(8), { weights: DEFAULT_WEIGHTS });

    expect(result.compositeScore).toBeGreaterThanOrEqual(7.5);
    expect(result.recommendation).toBe("PROCEED");
  });

  it("returns FURTHER_REVIEW when composite score is 5.5–7.4 (all dimensions at 6)", () => {
    const result = scoreAnalysis(makeAnalysis(6), { weights: DEFAULT_WEIGHTS });

    expect(result.compositeScore).toBeGreaterThanOrEqual(5.5);
    expect(result.compositeScore).toBeLessThan(7.5);
    expect(result.recommendation).toBe("FURTHER_REVIEW");
  });

  it("returns PASS when composite score is below 5.5 (all dimensions at 4)", () => {
    const result = scoreAnalysis(makeAnalysis(4), { weights: DEFAULT_WEIGHTS });

    expect(result.compositeScore).toBeLessThan(5.5);
    expect(result.recommendation).toBe("PASS");
  });

  it("boundary: composite exactly 7.5 → PROCEED", () => {
    // Concentrate weight on two dimensions; scores 7 & 8 → (7×50 + 8×50)/100 = 7.5
    const weights: DimensionWeights = {
      companyOverview: 50,
      marketOpportunity: 50,
      financialProfile: 0,
      managementTeam: 0,
      investmentThesis: 0,
      riskAssessment: 0,
      dealDynamics: 0,
    };
    const analysis: ISTAnalysis = {
      ...makeAnalysis(7),
      marketOpportunity: makeSection("Market Opportunity", 8) as ISTAnalysis["marketOpportunity"],
    };

    const result = scoreAnalysis(analysis, { weights });

    expect(result.compositeScore).toBe(7.5);
    expect(result.recommendation).toBe("PROCEED");
  });

  it("boundary: composite exactly 5.5 → FURTHER_REVIEW", () => {
    // Concentrate weight on two dimensions; scores 5 & 6 → (5×50 + 6×50)/100 = 5.5
    const weights: DimensionWeights = {
      companyOverview: 50,
      marketOpportunity: 50,
      financialProfile: 0,
      managementTeam: 0,
      investmentThesis: 0,
      riskAssessment: 0,
      dealDynamics: 0,
    };
    const analysis: ISTAnalysis = {
      ...makeAnalysis(5),
      marketOpportunity: makeSection("Market Opportunity", 6) as ISTAnalysis["marketOpportunity"],
    };

    const result = scoreAnalysis(analysis, { weights });

    expect(result.compositeScore).toBe(5.5);
    expect(result.recommendation).toBe("FURTHER_REVIEW");
  });

  it("just below FURTHER_REVIEW boundary (5.4) → PASS", () => {
    // scores 5 & 6, weights 60/40 → (5×60 + 6×40)/100 = 5.4
    const weights: DimensionWeights = {
      companyOverview: 60,
      marketOpportunity: 40,
      financialProfile: 0,
      managementTeam: 0,
      investmentThesis: 0,
      riskAssessment: 0,
      dealDynamics: 0,
    };
    const analysis: ISTAnalysis = {
      ...makeAnalysis(5),
      marketOpportunity: makeSection("Market Opportunity", 6) as ISTAnalysis["marketOpportunity"],
    };

    const result = scoreAnalysis(analysis, { weights });

    expect(result.compositeScore).toBe(5.4);
    expect(result.recommendation).toBe("PASS");
  });
});

// ---------------------------------------------------------------------------
// 2. Hard Disqualifiers — PRD §3.6
// ---------------------------------------------------------------------------

describe("PRD §3.6 — Hard Disqualifiers (automatic PASS regardless of score)", () => {
  /** High-scoring baseline — would naturally PROCEED without a disqualifier. */
  const HIGH_SCORE_ANALYSIS = makeAnalysis(9);

  it("baseline: high-scoring analysis without disqualifiers returns PROCEED", () => {
    const result = scoreAnalysis(HIGH_SCORE_ANALYSIS, { weights: DEFAULT_WEIGHTS });

    expect(result.recommendation).toBe("PROCEED");
    expect(result.isDisqualified).toBe(false);
  });

  // ── Disqualifier 1: Revenue below $2 M ────────────────────────────────────

  it("(1) revenue below $2 M triggers automatic PASS", () => {
    const analysis = makeAnalysisWithSnapshot(9, { revenue: 1_500_000 });
    const rule: HardDisqualifier = {
      field: "snapshot.revenue",
      condition: "lt",
      value: 2_000_000,
      reason: "Revenue below $2M: too small for meaningful PE returns at Catalyze's scale.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PASS");
    expect(result.isDisqualified).toBe(true);
    expect(result.disqualifierReason).toContain("Revenue below $2M");
  });

  it("(1) revenue at or above $2 M does not trigger the revenue disqualifier", () => {
    const analysis = makeAnalysisWithSnapshot(9, { revenue: 2_000_000 });
    const rule: HardDisqualifier = {
      field: "snapshot.revenue",
      condition: "lt",
      value: 2_000_000,
      reason: "Revenue below $2M.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PROCEED");
    expect(result.isDisqualified).toBe(false);
  });

  // ── Disqualifier 2: Non-US HQ ─────────────────────────────────────────────

  it("(2) non-US headquartered triggers automatic PASS", () => {
    const analysis = makeAnalysisWithSnapshot(9, { hq_country: "CA" });
    const rule: HardDisqualifier = {
      field: "snapshot.hq_country",
      condition: "neq",
      value: "US",
      reason: "Non-U.S. headquartered: outside Catalyze's investment mandate.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PASS");
    expect(result.isDisqualified).toBe(true);
    expect(result.disqualifierReason).toContain("Non-U.S.");
  });

  it("(2) US-headquartered company does not trigger the non-US disqualifier", () => {
    const analysis = makeAnalysisWithSnapshot(9, { hq_country: "US" });
    const rule: HardDisqualifier = {
      field: "snapshot.hq_country",
      condition: "neq",
      value: "US",
      reason: "Non-U.S. headquartered.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PROCEED");
    expect(result.isDisqualified).toBe(false);
  });

  // ── Disqualifier 3: Cannabis / crypto / regulated substance ───────────────

  it("(3) cannabis / crypto / regulated substance triggers automatic PASS", () => {
    // Stored as a numeric flag (1 = true) for compatibility with the
    // numeric DisqualifierCondition operators supported by the engine.
    const analysis = makeAnalysisWithSnapshot(9, { is_regulated_substance: 1 });
    const rule: HardDisqualifier = {
      field: "snapshot.is_regulated_substance",
      condition: "eq",
      value: 1,
      reason:
        "Regulated substance / cannabis / cryptocurrency: outside Catalyze's mandate.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PASS");
    expect(result.isDisqualified).toBe(true);
    expect(result.disqualifierReason).toContain("Regulated substance");
  });

  it("(3) non-regulated business does not trigger the substance disqualifier", () => {
    const analysis = makeAnalysisWithSnapshot(9, { is_regulated_substance: 0 });
    const rule: HardDisqualifier = {
      field: "snapshot.is_regulated_substance",
      condition: "eq",
      value: 1,
      reason: "Regulated substance.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PROCEED");
    expect(result.isDisqualified).toBe(false);
  });

  // ── Disqualifier 4: Heavy cyclicality with no recurring revenue ───────────

  it("(4) heavy cyclicality with no recurring revenue triggers automatic PASS", () => {
    const analysis = makeAnalysisWithSnapshot(9, { is_heavily_cyclical_no_recurring: 1 });
    const rule: HardDisqualifier = {
      field: "snapshot.is_heavily_cyclical_no_recurring",
      condition: "eq",
      value: 1,
      reason:
        "Heavy cyclicality with no recurring revenue: does not meet Catalyze's investment criteria.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PASS");
    expect(result.isDisqualified).toBe(true);
    expect(result.disqualifierReason).toContain("cyclicality");
  });

  it("(4) business with recurring revenue does not trigger the cyclicality disqualifier", () => {
    const analysis = makeAnalysisWithSnapshot(9, { is_heavily_cyclical_no_recurring: 0 });
    const rule: HardDisqualifier = {
      field: "snapshot.is_heavily_cyclical_no_recurring",
      condition: "eq",
      value: 1,
      reason: "Heavy cyclicality with no recurring revenue.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PROCEED");
    expect(result.isDisqualified).toBe(false);
  });

  // ── Disqualifier 5: Asking multiple above 15× EBITDA ─────────────────────

  it("(5) asking multiple above 15× EBITDA triggers automatic PASS", () => {
    const analysis = makeAnalysisWithSnapshot(9, { ev_ebitda_multiple: 18 });
    const rule: HardDisqualifier = {
      field: "snapshot.ev_ebitda_multiple",
      condition: "gt",
      value: 15,
      reason: "Asking multiple above 15x EBITDA with no clear justification.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PASS");
    expect(result.isDisqualified).toBe(true);
    expect(result.disqualifierReason).toContain("15x EBITDA");
  });

  it("(5) asking multiple at exactly 15× EBITDA does not trigger the multiple disqualifier", () => {
    const analysis = makeAnalysisWithSnapshot(9, { ev_ebitda_multiple: 15 });
    const rule: HardDisqualifier = {
      field: "snapshot.ev_ebitda_multiple",
      condition: "gt",
      value: 15,
      reason: "Asking multiple above 15x EBITDA.",
    };

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: [rule],
    });

    expect(result.recommendation).toBe("PROCEED");
    expect(result.isDisqualified).toBe(false);
  });

  // ── Multiple disqualifiers simultaneously ─────────────────────────────────

  it("first matching disqualifier wins when multiple rules fire simultaneously", () => {
    // Both revenue and multiple breach their thresholds.
    const analysis = makeAnalysisWithSnapshot(9, {
      revenue: 500_000,
      ev_ebitda_multiple: 18,
    });
    const rules: HardDisqualifier[] = [
      {
        field: "snapshot.revenue",
        condition: "lt",
        value: 2_000_000,
        reason: "Revenue below $2M.",
      },
      {
        field: "snapshot.ev_ebitda_multiple",
        condition: "gt",
        value: 15,
        reason: "Multiple above 15x EBITDA.",
      },
    ];

    const result = scoreAnalysis(analysis, {
      weights: DEFAULT_WEIGHTS,
      hardDisqualifiers: rules,
    });

    expect(result.recommendation).toBe("PASS");
    expect(result.isDisqualified).toBe(true);
    // First rule wins — revenue check comes before multiple check
    expect(result.disqualifierReason).toContain("Revenue below $2M");
  });
});

// ---------------------------------------------------------------------------
// 3. Null Dimension Score Weight Redistribution — PRD §4.2.2 / §3.6
// ---------------------------------------------------------------------------

describe("PRD §3.6 — Null Dimension Score Weight Redistribution", () => {
  it("null scores are excluded and weight is redistributed to non-null dimensions", () => {
    // Five scored dimensions at 8 — baseline average = 8.0
    const allScored: ISTDimensionScore[] = [
      makeDimScore(8, "d1"),
      makeDimScore(8, "d2"),
      makeDimScore(8, "d3"),
      makeDimScore(8, "d4"),
      makeDimScore(8, "d5"),
    ];
    const { compositeScore: allFive } = computeCompositeScore(allScored);

    // Two dimensions become null — weight redistributes to the remaining three
    const withNulls: ISTDimensionScore[] = [
      makeDimScore(8, "d1"),
      makeDimScore(8, "d2"),
      makeDimScore(8, "d3"),
      makeDimScore(null, "d4"),
      makeDimScore(null, "d5"),
    ];
    const { compositeScore: withTwoNulls } = computeCompositeScore(withNulls);

    // Both composites should equal 8.0 — null dimensions do not penalise the deal
    expect(allFive).toBe(8.0);
    expect(withTwoNulls).toBe(8.0);
  });

  it("null scores do not count as zero (treating null as zero would unfairly penalise)", () => {
    // If null were treated as 0: (8+8+8+0+0)/5 = 4.8 → PASS
    // Correct behaviour (null excluded):  (8+8+8)/3 = 8.0 → PROCEED
    const withNulls: ISTDimensionScore[] = [
      makeDimScore(8, "d1"),
      makeDimScore(8, "d2"),
      makeDimScore(8, "d3"),
      makeDimScore(null, "d4"),
      makeDimScore(null, "d5"),
    ];

    const { compositeScore, recommendation } = computeCompositeScore(withNulls);

    expect(compositeScore).not.toBe(4.8);
    expect(compositeScore).toBe(8.0);
    expect(recommendation).toBe("PROCEED");
  });

  it("adding a null dimension to a mixed-score set leaves the composite unchanged", () => {
    // Scores 10 & 2, equal weight → avg = 6.0 → FURTHER_REVIEW
    const noNulls: ISTDimensionScore[] = [
      makeDimScore(10, "high"),
      makeDimScore(2, "low"),
    ];
    const { compositeScore: avgBoth, recommendation: recBoth } =
      computeCompositeScore(noNulls);
    expect(avgBoth).toBe(6.0);
    expect(recBoth).toBe("FURTHER_REVIEW");

    // Same pair + 1 null → avg of the two non-null scores = 6.0 unchanged
    const withOneNull: ISTDimensionScore[] = [
      makeDimScore(10, "high"),
      makeDimScore(2, "low"),
      makeDimScore(null, "missing"),
    ];
    const { compositeScore: avgWithNull, recommendation: recWithNull } =
      computeCompositeScore(withOneNull);
    expect(avgWithNull).toBe(6.0);
    expect(recWithNull).toBe("FURTHER_REVIEW");
  });

  it("all-null scores produce composite of 1 and a PASS recommendation", () => {
    const allNull: ISTDimensionScore[] = [
      makeDimScore(null, "d1"),
      makeDimScore(null, "d2"),
    ];

    const { compositeScore, recommendation } = computeCompositeScore(allNull);

    expect(compositeScore).toBe(1);
    expect(recommendation).toBe("PASS");
  });

  it("single non-null score determines the composite when all others are null", () => {
    const oneScored: ISTDimensionScore[] = [
      makeDimScore(8, "scored"),
      makeDimScore(null, "missing1"),
      makeDimScore(null, "missing2"),
      makeDimScore(null, "missing3"),
    ];

    const { compositeScore, recommendation } = computeCompositeScore(oneScored);

    expect(compositeScore).toBe(8.0);
    expect(recommendation).toBe("PROCEED");
  });

  it("partial null set: average of non-null dimensions drives the recommendation bucket", () => {
    // 3 scored dimensions at 5, 2 null → avg of non-null = 5.0
    // 5.0 is below the FURTHER_REVIEW lower bound (5.5), so recommendation = PASS
    const scores: ISTDimensionScore[] = [
      makeDimScore(5, "d1"),
      makeDimScore(5, "d2"),
      makeDimScore(5, "d3"),
      makeDimScore(null, "d4"),
      makeDimScore(null, "d5"),
    ];

    const { compositeScore, recommendation } = computeCompositeScore(scores);

    expect(compositeScore).toBe(5.0);
    expect(recommendation).toBe("PASS");
  });
});

// ---------------------------------------------------------------------------
// 4. Scoring Weight Integrity — PRD §3.5
// ---------------------------------------------------------------------------

describe("PRD §3.5 — Scoring Weights Sum to 100 %", () => {
  it("PRD §3.5 Traditional PE track weights sum to exactly 100 %", () => {
    expect(sumWeights(PRD_PE_WEIGHTS)).toBe(100);
  });

  it("PRD §3.5 IP / Technology track weights sum to exactly 100 %", () => {
    expect(sumWeights(PRD_IP_TECH_WEIGHTS)).toBe(100);
  });

  it("scoring engine DEFAULT_WEIGHTS (7-section map) sum to exactly 100 %", () => {
    expect(sumWeights(DEFAULT_WEIGHTS)).toBe(100);
  });

  it("all PRD §3.5 PE dimension weights are positive (no zero or negative entries)", () => {
    for (const [dim, weight] of Object.entries(PRD_PE_WEIGHTS)) {
      expect(weight, `PE dimension "${dim}" must be > 0`).toBeGreaterThan(0);
      expect(weight, `PE dimension "${dim}" must be <= 100`).toBeLessThanOrEqual(100);
    }
  });

  it("all PRD §3.5 IP/Tech dimension weights are positive (no zero or negative entries)", () => {
    for (const [dim, weight] of Object.entries(PRD_IP_TECH_WEIGHTS)) {
      expect(weight, `IP/Tech dimension "${dim}" must be > 0`).toBeGreaterThan(0);
      expect(weight, `IP/Tech dimension "${dim}" must be <= 100`).toBeLessThanOrEqual(100);
    }
  });

  it("PRD §3.5 PE track covers all 10 required dimensions", () => {
    const required = [
      "financial_quality",
      "market_attractiveness",
      "value_creation_potential",
      "competitive_position",
      "customer_quality",
      "risk_profile",
      "strategic_fit",
      "valuation_attractiveness",
      "transaction_feasibility",
      "management_team",
    ];
    for (const dim of required) {
      expect(
        PRD_PE_WEIGHTS,
        `PE weight table missing dimension: "${dim}"`,
      ).toHaveProperty(dim);
    }
  });

  it("PRD §3.5 IP/Tech track covers all 10 required dimensions", () => {
    const required = [
      "technology_readiness",
      "ip_strength_defensibility",
      "market_attractiveness",
      "commercialization_pathway",
      "orthogonal_application_potential",
      "competitive_position",
      "value_creation_potential",
      "risk_profile",
      "strategic_fit",
      "management_team",
    ];
    for (const dim of required) {
      expect(
        PRD_IP_TECH_WEIGHTS,
        `IP/Tech weight table missing dimension: "${dim}"`,
      ).toHaveProperty(dim);
    }
  });

  it("scoreAnalysis throws when weights do not sum to 100", () => {
    const badWeights: DimensionWeights = {
      ...DEFAULT_WEIGHTS,
      companyOverview: DEFAULT_WEIGHTS.companyOverview + 5, // sum = 105
    };

    expect(() => scoreAnalysis(makeAnalysis(7), { weights: badWeights })).toThrow(
      /weights must sum to 100/i,
    );
  });

  it("scoreAnalysis throws when any weight is negative", () => {
    const badWeights: DimensionWeights = {
      ...DEFAULT_WEIGHTS,
      companyOverview: -5,
    };

    expect(() => scoreAnalysis(makeAnalysis(7), { weights: badWeights })).toThrow(
      /must be >= 0/i,
    );
  });
});
