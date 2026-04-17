/**
 * Automated quality benchmark checks — PRD §9.2
 *
 * Verifies that ISTAnalysis outputs produced by the screener meet the five
 * quality benchmarks specified in PRD §9.2:
 *
 *   1. Investment Snapshot  — all §4.2.1 fields populated or explicitly null
 *   2. Strengths            — each entry includes a specific data point
 *   3. Risk table           — every risk has severity + mitigation (§3.1)
 *   4. Value creation       — EBITDA impact ranges on near/medium-term items
 *   5. Key questions        — each question includes a "validates" parenthetical
 *
 * Each benchmark is tested with:
 *   - A well-formed ("passing") fixture that represents acceptable AI output
 *   - One or more deliberately broken ("failing") fixtures that exercise every
 *     individual violation the validator is designed to catch
 */

import { describe, it, expect } from "vitest";
import type {
  ISTAnalysis,
  ISTSnapshot,
  ISTStrength,
  ISTRisk,
  ISTValueCreation,
  ISTKeyQuestion,
} from "@/types/ist";
import {
  checkSnapshot,
  checkStrengths,
  checkRisks,
  checkValueCreation,
  checkKeyQuestions,
  runQualityBenchmarks,
  SNAPSHOT_REQUIRED_FIELDS,
} from "@/lib/qualityBenchmarks";

// ===========================================================================
// Shared fixtures
// ===========================================================================

/** A valid snapshot — all §4.2.1 fields present, critical financials populated. */
const VALID_SNAPSHOT: ISTSnapshot = {
  company_name: "Omega Technologies, Inc.",
  industry: "Aerospace & Industrial Tooling",
  location: "Westlake Village, CA",
  transaction_type: "100% Acquisition (Founder Retirement)",
  revenue: 9_500_000,
  revenue_growth_rate: 14,
  ebitda: 1_000_000,
  ebitda_margin: 10.5,
  asking_price: 5_250_000,
  ev_ebitda_multiple: 5.25,
  employee_count: 20,
  year_founded: 1983,
  deal_source: "Proprietary",
  customer_concentration_pct: 7,
};

/** A valid strengths array — specific data points in every supporting_data entry. */
const VALID_STRENGTHS: ISTStrength[] = [
  {
    category: "Market Position",
    title: "Blue-Chip Aerospace OEM Relationships",
    description:
      "Omega has supplied Boeing, Lockheed, and SpaceX for 40+ years, creating high switching costs.",
    supporting_data: [
      "40+ year supplier relationships with Boeing, Lockheed Martin, and SpaceX",
      "Largest customer = 7% of revenue (low concentration)",
    ],
  },
  {
    category: "Business Model",
    title: "Digital-First Sales Engine",
    description:
      "80% of revenue generated through owned e-commerce properties at exceptional ROI on ad spend.",
    supporting_data: [
      "$4.3M in web-generated sales on $45K ad spend (95:1 ROAS)",
      "23+ owned e-commerce sites — Amazon = 9% of revenue",
    ],
  },
  {
    category: "Financial Profile",
    title: "Debt-Free Balance Sheet",
    description: "Asset-light model with zero long-term debt and strong free cash flow conversion.",
    supporting_data: [
      "$0 long-term debt",
      "11% EBITDA margin on $9.5M revenue",
    ],
  },
];

/** A valid risks array — all fields populated with valid severity values. */
const VALID_RISKS: ISTRisk[] = [
  {
    risk: "Founder / key-person dependency",
    severity: "Medium",
    mitigation:
      "VP of Operations has 15 years of tenure and demonstrated ability to manage day-to-day operations.",
    evidence:
      "Document confirms VP tenure and operational continuity plan; founder willing to stay 12 months post-close.",
  },
  {
    risk: "Supplier concentration — single supplier at 21%",
    severity: "Medium",
    mitigation:
      "Long-standing relationship (18 years); secondary qualified supplier identified in document.",
    evidence: "Top supplier = 21% of COGS; document lists two backup suppliers already qualified.",
  },
  {
    risk: "E-commerce platform dependency (Amazon 9%)",
    severity: "Low",
    mitigation:
      "Revenue diversified across 23+ owned sites; Amazon represents a minority channel.",
    evidence:
      "Amazon = 9% of revenue; owned e-commerce = 80% organic traffic per document.",
  },
];

/** A valid value_creation object — EBITDA ranges on all near/medium items. */
const VALID_VALUE_CREATION: ISTValueCreation = {
  near_term: [
    {
      initiative: "E-commerce channel expansion to 5 new verticals",
      ebitda_impact_low: 500_000,
      ebitda_impact_high: 750_000,
      investment_required: 150_000,
      timeline: "Q1–Q4 Year 1",
    },
    {
      initiative: "Retail channel launch for Cleco kit bundles",
      ebitda_impact_low: 300_000,
      ebitda_impact_high: 500_000,
      investment_required: 75_000,
      timeline: "Q2–Q4 Year 1",
    },
  ],
  medium_term: [
    {
      initiative: "International distribution via aerospace MRO partners",
      ebitda_impact_low: 250_000,
      ebitda_impact_high: 500_000,
      investment_required: 200_000,
      timeline: "Year 2–3",
    },
  ],
  exit_positioning: [
    {
      initiative: "Strategic sale to aerospace OEM distributor",
      ebitda_impact_low: null,
      ebitda_impact_high: null,
      investment_required: null,
      timeline: "Year 4–5",
    },
  ],
};

/** A valid key_questions array — 5–10 items each with a validates string. */
const VALID_KEY_QUESTIONS: ISTKeyQuestion[] = [
  {
    question:
      "What is the contractual nature of relationships with Boeing and Lockheed — are there preferred supplier agreements, and what are the renewal terms?",
    validates: "Customer quality / key-person dependency risk",
  },
  {
    question:
      "Can you walk us through the founder's transition plan and the VP's capacity to run operations independently post-close?",
    validates: "Founder dependency risk (Medium severity)",
  },
  {
    question:
      "What were the top-line drivers of 14% revenue CAGR — pricing, volume, or new customer acquisition?",
    validates: "Financial profile / revenue growth rate assumption",
  },
  {
    question:
      "What is the status of the Roller Ratchet® and SAVI® patent applications — granted, pending, or expired?",
    validates: "IP defensibility / competitive moat thesis",
  },
  {
    question:
      "Has management prepared a written business plan for the e-commerce expansion thesis — what markets and SKUs are targeted?",
    validates: "Near-term value creation initiative (e-commerce expansion $500–750K EBITDA)",
  },
];

/** A minimal but complete ISTAnalysis used for the end-to-end benchmark run. */
const VALID_ANALYSIS: ISTAnalysis = {
  schema_version: "1.0",
  generated_at: "2026-04-17T22:00:00.000Z",
  company_name: "Omega Technologies, Inc.",
  deal_type: "traditional_pe",
  snapshot: VALID_SNAPSHOT,
  strengths: VALID_STRENGTHS,
  risks: VALID_RISKS,
  value_creation: VALID_VALUE_CREATION,
  scores: [
    {
      dimension: "market_attractiveness",
      score: 7,
      justification:
        "Aviation tooling market growing at 6% CAGR with favorable secular tailwinds from commercial fleet expansion.",
      data_gaps: [],
    },
  ],
  recommendation: {
    verdict: "PROCEED",
    reasoning: [
      "40+ year defensible market position with blue-chip aerospace OEMs",
      "Digital-first business model generating exceptional ROAS (95:1)",
      "$1.5M+ in identified EBITDA upside (>50% of entry EBITDA)",
    ],
    suggested_loi_terms: "$5.0–5.5M (4.9–5.4x TTM Adj. EBITDA); 80% cash / 20% seller note",
    disqualifying_factors: null,
  },
  key_questions: VALID_KEY_QUESTIONS,
  data_quality: {
    completeness_pct: 92,
    missing_critical_fields: [],
    caveats: ["EBITDA margin calculated from reported figures; no QoE has been performed."],
  },
};

// ===========================================================================
// Benchmark 1 — Investment Snapshot (PRD §4.2.1)
// ===========================================================================

describe("Benchmark 1 — Investment Snapshot (PRD §4.2.1)", () => {
  it("passes when all §4.2.1 fields are present and critical financials are populated", () => {
    const result = checkSnapshot(VALID_SNAPSHOT);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("passes when optional fields are explicitly null (not missing)", () => {
    const snapshot: ISTSnapshot = {
      ...VALID_SNAPSHOT,
      customer_concentration_pct: null,
      year_founded: null,
      employee_count: null,
      deal_source: null,
    };
    const result = checkSnapshot(snapshot);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when a §4.2.1 field is entirely missing from the object", () => {
    // Build a snapshot that has revenue_growth_rate removed entirely
    const snapshotMissingField = Object.fromEntries(
      Object.entries(VALID_SNAPSHOT).filter(([k]) => k !== "revenue_growth_rate"),
    ) as ISTSnapshot;
    const result = checkSnapshot(snapshotMissingField);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("revenue_growth_rate"))).toBe(true);
  });

  it("fails when company_name is an empty string", () => {
    const result = checkSnapshot({ ...VALID_SNAPSHOT, company_name: "  " });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("company_name"))).toBe(true);
  });

  it("fails when both revenue and ebitda are null (Insufficient Data guard — §4.2.2)", () => {
    const result = checkSnapshot({ ...VALID_SNAPSHOT, revenue: null, ebitda: null });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.toLowerCase().includes("insufficient data")),
    ).toBe(true);
  });

  it("passes when only one of revenue/ebitda is null", () => {
    const result = checkSnapshot({ ...VALID_SNAPSHOT, revenue: null, ebitda: 1_000_000 });
    expect(result.passed).toBe(true);
  });

  it("SNAPSHOT_REQUIRED_FIELDS covers every field listed in §4.2.1", () => {
    // Ensure the constant itself matches the expected set so it stays in sync
    const expected: Array<keyof ISTSnapshot> = [
      "company_name",
      "industry",
      "location",
      "transaction_type",
      "revenue",
      "revenue_growth_rate",
      "ebitda",
      "ebitda_margin",
      "asking_price",
      "ev_ebitda_multiple",
      "employee_count",
      "year_founded",
      "deal_source",
      "customer_concentration_pct",
    ];
    expect([...SNAPSHOT_REQUIRED_FIELDS].sort()).toEqual([...expected].sort());
  });
});

// ===========================================================================
// Benchmark 2 — Strengths (PRD §5.2)
// ===========================================================================

describe("Benchmark 2 — Strengths (PRD §5.2)", () => {
  it("passes when every strength has specific, data-backed supporting_data entries", () => {
    const result = checkStrengths(VALID_STRENGTHS);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when the strengths array is empty", () => {
    const result = checkStrengths([]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("empty"))).toBe(true);
  });

  it("fails when a strength has no supporting_data entries", () => {
    const badStrength: ISTStrength = {
      ...VALID_STRENGTHS[0],
      supporting_data: [],
    };
    const result = checkStrengths([badStrength]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("supporting_data is empty"))).toBe(true);
  });

  it("fails when a supporting_data entry is a generic platitude with no data point", () => {
    const badStrength: ISTStrength = {
      ...VALID_STRENGTHS[0],
      supporting_data: ["Strong market position", "Good growth prospects"],
    };
    const result = checkStrengths([badStrength]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("appears generic"))).toBe(true);
  });

  it("fails when a strength is missing its title", () => {
    const badStrength: ISTStrength = { ...VALID_STRENGTHS[0], title: "" };
    const result = checkStrengths([badStrength]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("title is missing"))).toBe(true);
  });

  it("fails when a strength is missing its category", () => {
    const badStrength: ISTStrength = { ...VALID_STRENGTHS[0], category: "" };
    const result = checkStrengths([badStrength]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("category is missing"))).toBe(true);
  });

  it("passes when supporting_data contains a percentage figure", () => {
    const strength: ISTStrength = {
      ...VALID_STRENGTHS[0],
      supporting_data: ["EBITDA margin of 18% — above the 14–16% sector average"],
    };
    const result = checkStrengths([strength]);
    expect(result.passed).toBe(true);
  });

  it("passes when supporting_data references a named company", () => {
    const strength: ISTStrength = {
      ...VALID_STRENGTHS[0],
      supporting_data: ["Primary customer: Boeing (long-term MSA)"],
    };
    const result = checkStrengths([strength]);
    expect(result.passed).toBe(true);
  });
});

// ===========================================================================
// Benchmark 3 — Risk table (PRD §3.1 / §5.2)
// ===========================================================================

describe("Benchmark 3 — Risk table (PRD §3.1 / §5.2)", () => {
  it("passes when every risk has a valid severity, mitigation, and evidence", () => {
    const result = checkRisks(VALID_RISKS);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when the risks array is empty", () => {
    const result = checkRisks([]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("empty"))).toBe(true);
  });

  it("fails when a risk has an invalid severity value", () => {
    const badRisk: ISTRisk = {
      ...VALID_RISKS[0],
      severity: "Critical" as ISTRisk["severity"],
    };
    const result = checkRisks([badRisk]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("severity") && v.includes("Critical"))).toBe(
      true,
    );
  });

  it("accepts all three valid severity values", () => {
    const riskHigh: ISTRisk = { ...VALID_RISKS[0], severity: "High" };
    const riskMedium: ISTRisk = { ...VALID_RISKS[0], severity: "Medium" };
    const riskLow: ISTRisk = { ...VALID_RISKS[0], severity: "Low" };
    expect(checkRisks([riskHigh]).passed).toBe(true);
    expect(checkRisks([riskMedium]).passed).toBe(true);
    expect(checkRisks([riskLow]).passed).toBe(true);
  });

  it("fails when a risk has an empty mitigation field", () => {
    const badRisk: ISTRisk = { ...VALID_RISKS[0], mitigation: "" };
    const result = checkRisks([badRisk]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("mitigation is missing"))).toBe(true);
  });

  it("fails when a risk has an empty evidence field", () => {
    const badRisk: ISTRisk = { ...VALID_RISKS[0], evidence: "" };
    const result = checkRisks([badRisk]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("evidence is missing"))).toBe(true);
  });

  it("fails when a risk description is empty", () => {
    const badRisk: ISTRisk = { ...VALID_RISKS[0], risk: "  " };
    const result = checkRisks([badRisk]);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("risk description"))).toBe(true);
  });

  it("reports individual violations per risk without short-circuiting", () => {
    const badRisks: ISTRisk[] = [
      { ...VALID_RISKS[0], mitigation: "" },
      { ...VALID_RISKS[1], severity: "Unknown" as ISTRisk["severity"] },
    ];
    const result = checkRisks(badRisks);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// Benchmark 4 — Value creation thesis (PRD §3.1 / §5.2)
// ===========================================================================

describe("Benchmark 4 — Value creation thesis (PRD §3.1 / §5.2)", () => {
  it("passes when near_term and medium_term items have non-null EBITDA impact ranges", () => {
    const result = checkValueCreation(VALID_VALUE_CREATION);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when near_term array is empty", () => {
    const result = checkValueCreation({ ...VALID_VALUE_CREATION, near_term: [] });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("near_term"))).toBe(true);
  });

  it("fails when medium_term array is empty", () => {
    const result = checkValueCreation({ ...VALID_VALUE_CREATION, medium_term: [] });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("medium_term"))).toBe(true);
  });

  it("fails when a near_term initiative has null ebitda_impact_low", () => {
    const badNearTerm = [
      { ...VALID_VALUE_CREATION.near_term[0], ebitda_impact_low: null },
      ...VALID_VALUE_CREATION.near_term.slice(1),
    ];
    const result = checkValueCreation({ ...VALID_VALUE_CREATION, near_term: badNearTerm });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.includes("ebitda_impact_low") && v.includes("near_term")),
    ).toBe(true);
  });

  it("fails when a near_term initiative has null ebitda_impact_high", () => {
    const badNearTerm = [
      { ...VALID_VALUE_CREATION.near_term[0], ebitda_impact_high: null },
      ...VALID_VALUE_CREATION.near_term.slice(1),
    ];
    const result = checkValueCreation({ ...VALID_VALUE_CREATION, near_term: badNearTerm });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.includes("ebitda_impact_high") && v.includes("near_term")),
    ).toBe(true);
  });

  it("fails when a medium_term initiative has null ebitda_impact_low", () => {
    const badMediumTerm = [
      { ...VALID_VALUE_CREATION.medium_term[0], ebitda_impact_low: null },
    ];
    const result = checkValueCreation({ ...VALID_VALUE_CREATION, medium_term: badMediumTerm });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (v) => v.includes("ebitda_impact_low") && v.includes("medium_term"),
      ),
    ).toBe(true);
  });

  it("fails when ebitda_impact_low exceeds ebitda_impact_high (inverted range)", () => {
    const badNearTerm = [
      { ...VALID_VALUE_CREATION.near_term[0], ebitda_impact_low: 900_000, ebitda_impact_high: 500_000 },
    ];
    const result = checkValueCreation({ ...VALID_VALUE_CREATION, near_term: badNearTerm });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("exceeds"))).toBe(true);
  });

  it("does not require EBITDA ranges on exit_positioning items", () => {
    // exit_positioning with null ranges should still pass (§5.4 does not require them)
    const vc: ISTValueCreation = {
      ...VALID_VALUE_CREATION,
      exit_positioning: [
        {
          initiative: "Strategic sale to a Fortune 500 industrial conglomerate",
          ebitda_impact_low: null,
          ebitda_impact_high: null,
          investment_required: null,
          timeline: "Year 4–5",
        },
      ],
    };
    const result = checkValueCreation(vc);
    expect(result.passed).toBe(true);
  });

  it("fails when an initiative description is empty", () => {
    const badNearTerm = [{ ...VALID_VALUE_CREATION.near_term[0], initiative: "" }];
    const result = checkValueCreation({ ...VALID_VALUE_CREATION, near_term: badNearTerm });
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("initiative description"))).toBe(true);
  });
});

// ===========================================================================
// Benchmark 5 — Key questions (PRD §5.2)
// ===========================================================================

describe("Benchmark 5 — Key questions (PRD §5.2)", () => {
  it("passes when 5–10 questions are present and each has a non-empty validates field", () => {
    const result = checkKeyQuestions(VALID_KEY_QUESTIONS);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when fewer than 5 questions are provided", () => {
    const result = checkKeyQuestions(VALID_KEY_QUESTIONS.slice(0, 4));
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("5–10"))).toBe(true);
  });

  it("fails when more than 10 questions are provided", () => {
    const tooMany: ISTKeyQuestion[] = Array.from({ length: 11 }, (_, i) => ({
      question: `Question ${i + 1} about the deal?`,
      validates: `Risk element ${i + 1}`,
    }));
    const result = checkKeyQuestions(tooMany);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("maximum of 10"))).toBe(true);
  });

  it("passes with exactly 5 questions", () => {
    const result = checkKeyQuestions(VALID_KEY_QUESTIONS.slice(0, 5));
    expect(result.passed).toBe(true);
  });

  it("passes with exactly 10 questions", () => {
    const tenQuestions: ISTKeyQuestion[] = Array.from({ length: 10 }, (_, i) => ({
      question: `Targeted question ${i + 1} about a specific risk or assumption?`,
      validates: `Risk ${i + 1} — customer concentration / management dependency`,
    }));
    const result = checkKeyQuestions(tenQuestions);
    expect(result.passed).toBe(true);
  });

  it("fails when a question has an empty question text", () => {
    const badQuestions: ISTKeyQuestion[] = [
      { ...VALID_KEY_QUESTIONS[0], question: "" },
      ...VALID_KEY_QUESTIONS.slice(1),
    ];
    const result = checkKeyQuestions(badQuestions);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("question text is missing"))).toBe(true);
  });

  it("fails when a question has an empty validates field (missing parenthetical)", () => {
    const badQuestions: ISTKeyQuestion[] = [
      { ...VALID_KEY_QUESTIONS[0], validates: "" },
      ...VALID_KEY_QUESTIONS.slice(1),
    ];
    const result = checkKeyQuestions(badQuestions);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("validates is missing"))).toBe(true);
  });

  it("reports one violation per offending question", () => {
    const badQuestions: ISTKeyQuestion[] = VALID_KEY_QUESTIONS.map((q) => ({
      ...q,
      validates: "",
    }));
    const result = checkKeyQuestions(badQuestions);
    // One violation per question
    expect(result.violations.filter((v) => v.includes("validates is missing"))).toHaveLength(
      badQuestions.length,
    );
  });
});

// ===========================================================================
// End-to-end — runQualityBenchmarks (all five at once)
// ===========================================================================

describe("runQualityBenchmarks — end-to-end quality report", () => {
  it("returns overall_passed: true for a well-formed ISTAnalysis", () => {
    const report = runQualityBenchmarks(VALID_ANALYSIS);
    expect(report.overall_passed).toBe(true);
    expect(report.snapshot.passed).toBe(true);
    expect(report.strengths.passed).toBe(true);
    expect(report.risks.passed).toBe(true);
    expect(report.value_creation.passed).toBe(true);
    expect(report.key_questions.passed).toBe(true);
  });

  it("returns overall_passed: false when any single benchmark fails", () => {
    // Corrupt just the key_questions benchmark
    const badAnalysis: ISTAnalysis = {
      ...VALID_ANALYSIS,
      key_questions: VALID_KEY_QUESTIONS.map((q) => ({ ...q, validates: "" })),
    };
    const report = runQualityBenchmarks(badAnalysis);
    expect(report.overall_passed).toBe(false);
    expect(report.key_questions.passed).toBe(false);
    // All other benchmarks still pass
    expect(report.snapshot.passed).toBe(true);
    expect(report.strengths.passed).toBe(true);
    expect(report.risks.passed).toBe(true);
    expect(report.value_creation.passed).toBe(true);
  });

  it("captures all failing benchmarks simultaneously", () => {
    const badAnalysis: ISTAnalysis = {
      ...VALID_ANALYSIS,
      snapshot: { ...VALID_SNAPSHOT, company_name: "" },
      strengths: [{ ...VALID_STRENGTHS[0], supporting_data: [] }],
      risks: [{ ...VALID_RISKS[0], severity: "Extreme" as ISTRisk["severity"] }],
      value_creation: { ...VALID_VALUE_CREATION, near_term: [] },
      key_questions: [{ ...VALID_KEY_QUESTIONS[0], validates: "" }],
    };
    const report = runQualityBenchmarks(badAnalysis);
    expect(report.overall_passed).toBe(false);
    expect(report.snapshot.passed).toBe(false);
    expect(report.strengths.passed).toBe(false);
    expect(report.risks.passed).toBe(false);
    expect(report.value_creation.passed).toBe(false);
    expect(report.key_questions.passed).toBe(false);
  });
});
