/**
 * IST Screener — Quality Benchmark Validators
 *
 * Implements the five automated quality checks described in PRD §9.2.
 * Each function accepts an ISTAnalysis (or a sub-section) and returns a
 * QualityCheckResult that can be used directly in test assertions or
 * displayed in a quality-report UI.
 *
 * Benchmark references:
 *   1. Investment Snapshot  — PRD §4.2.1 (extraction table)
 *   2. Strengths            — PRD §5.2 (specific data points required)
 *   3. Risk table           — PRD §3.1 / §5.2 (severity + mitigation)
 *   4. Value creation       — PRD §3.1 / §5.2 (EBITDA impact ranges)
 *   5. Key questions        — PRD §5.2 (validates parenthetical required)
 */

import type {
  ISTAnalysis,
  ISTSnapshot,
  ISTStrength,
  ISTRisk,
  ISTValueCreation,
  ISTValueCreationInitiative,
  ISTKeyQuestion,
  RiskSeverity,
} from "../types/ist";

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

export interface QualityCheckResult {
  /** Whether the benchmark was fully satisfied. */
  passed: boolean;
  /** Human-readable description of every violation found (empty when passed). */
  violations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SEVERITIES = new Set<RiskSeverity>(["High", "Medium", "Low"]);

/**
 * Returns true if the string contains at least one "specific data point" —
 * i.e., a number, percentage, currency value, or a proper noun / named entity
 * (checked heuristically by looking for digits or title-cased multi-word phrases).
 *
 * This is intentionally permissive: we want to catch completely generic strings
 * like "Strong market position" while accepting "7% market share" or "Boeing".
 */
function containsSpecificDataPoint(text: string): boolean {
  // Contains any digit (handles $, %, x multiples, counts, years, etc.)
  if (/\d/.test(text)) return true;
  // Contains a capitalised word that appears after whitespace (i.e. is not the
  // first word of the string) — proxy for proper nouns: company names, products,
  // locations (e.g. "Boeing", "Lockheed Martin", "Westlake Village").
  if (/\s[A-Z][a-z]/.test(text)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Benchmark 1 — Investment Snapshot (PRD §4.2.1)
// ---------------------------------------------------------------------------

/**
 * All field keys that the PRD §4.2.1 extraction table requires the snapshot
 * to capture (or explicitly mark as unavailable via null).
 */
export const SNAPSHOT_REQUIRED_FIELDS: ReadonlyArray<keyof ISTSnapshot> = [
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

/**
 * Benchmark 1 — Investment Snapshot
 *
 * Checks:
 *   a) Every field listed in §4.2.1 is present on the snapshot object (either
 *      a value or explicitly null — not missing/undefined).
 *   b) company_name is a non-empty string (critical, always extractable).
 *   c) Revenue and EBITDA are not both null (§4.2.2: insufficient data guard).
 */
export function checkSnapshot(snapshot: ISTSnapshot): QualityCheckResult {
  const violations: string[] = [];

  for (const field of SNAPSHOT_REQUIRED_FIELDS) {
    if (!(field in snapshot)) {
      violations.push(
        `Snapshot field "${field}" is missing entirely (must be present, even if null).`,
      );
    }
  }

  if (!snapshot.company_name || snapshot.company_name.trim() === "") {
    violations.push(
      'snapshot.company_name must be a non-empty string (critical field per §4.2.1).',
    );
  }

  if (snapshot.revenue === null && snapshot.ebitda === null) {
    violations.push(
      "Both revenue and ebitda are null. Per §4.2.2, if both critical financial fields " +
        "are absent the screening should be flagged as Insufficient Data.",
    );
  }

  return { passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Benchmark 2 — Strengths (PRD §5.2)
// ---------------------------------------------------------------------------

/**
 * Benchmark 2 — Investment Strengths
 *
 * Checks per strength:
 *   a) The strengths array is non-empty (3–6 items per §5.2).
 *   b) Each strength has a non-empty category, title, and description.
 *   c) Each strength has at least one supporting_data entry.
 *   d) Every supporting_data entry contains a specific data point (a number,
 *      percentage, named customer/product, etc.) — not a generic claim.
 */
export function checkStrengths(strengths: ISTStrength[]): QualityCheckResult {
  const violations: string[] = [];

  if (strengths.length === 0) {
    violations.push("strengths array is empty; §5.2 requires 3–6 strengths.");
    return { passed: false, violations };
  }

  strengths.forEach((strength, idx) => {
    const label = `strengths[${idx}] ("${strength.title ?? ""}")`;

    if (!strength.category || strength.category.trim() === "") {
      violations.push(`${label}: category is missing or empty.`);
    }
    if (!strength.title || strength.title.trim() === "") {
      violations.push(`${label}: title is missing or empty.`);
    }
    if (!strength.description || strength.description.trim() === "") {
      violations.push(`${label}: description is missing or empty.`);
    }

    if (!strength.supporting_data || strength.supporting_data.length === 0) {
      violations.push(
        `${label}: supporting_data is empty. §5.2 requires each strength to cite ` +
          "specific data from the document (numbers, percentages, customer names, etc.).",
      );
    } else {
      strength.supporting_data.forEach((dataPoint, dpIdx) => {
        if (!dataPoint || dataPoint.trim() === "") {
          violations.push(`${label}: supporting_data[${dpIdx}] is an empty string.`);
        } else if (!containsSpecificDataPoint(dataPoint)) {
          violations.push(
            `${label}: supporting_data[${dpIdx}] "${dataPoint}" appears generic. ` +
              "It must include a specific data point (number, %, named entity) per §5.2.",
          );
        }
      });
    }
  });

  return { passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Benchmark 3 — Risk table (PRD §3.1 / §5.2)
// ---------------------------------------------------------------------------

/**
 * Benchmark 3 — Risk Table
 *
 * Checks per risk:
 *   a) The risks array is non-empty.
 *   b) Each risk has a non-empty risk description.
 *   c) Each risk has a valid severity: "High" | "Medium" | "Low" (§5.2 / §5.4).
 *   d) Each risk has a non-empty mitigation field (§3.1 / §5.2).
 *   e) Each risk has a non-empty evidence field (§5.4).
 */
export function checkRisks(risks: ISTRisk[]): QualityCheckResult {
  const violations: string[] = [];

  if (risks.length === 0) {
    violations.push(
      "risks array is empty; §5.2 requires all material risks to be identified.",
    );
    return { passed: false, violations };
  }

  risks.forEach((risk, idx) => {
    const label = `risks[${idx}] ("${risk.risk ?? ""}")`;

    if (!risk.risk || risk.risk.trim() === "") {
      violations.push(`${label}: risk description is missing or empty.`);
    }

    if (!VALID_SEVERITIES.has(risk.severity)) {
      violations.push(
        `${label}: severity "${String(risk.severity)}" is invalid. ` +
          'Must be "High", "Medium", or "Low" per §5.2.',
      );
    }

    if (!risk.mitigation || risk.mitigation.trim() === "") {
      violations.push(
        `${label}: mitigation is missing or empty. §3.1 / §5.2 require a mitigation for every risk.`,
      );
    }

    if (!risk.evidence || risk.evidence.trim() === "") {
      violations.push(
        `${label}: evidence is missing or empty. §5.4 requires supporting evidence for every risk.`,
      );
    }
  });

  return { passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Benchmark 4 — Value creation thesis (PRD §3.1 / §5.2)
// ---------------------------------------------------------------------------

/**
 * Checks that a single value-creation initiative has non-null EBITDA impact
 * bounds (ebitda_impact_low and ebitda_impact_high).
 */
function checkInitiativeEbitdaRange(
  initiative: ISTValueCreationInitiative,
  label: string,
  violations: string[],
): void {
  if (initiative.ebitda_impact_low === null || initiative.ebitda_impact_low === undefined) {
    violations.push(
      `${label}: ebitda_impact_low is null. §3.1 requires EBITDA impact ranges for every initiative.`,
    );
  }
  if (initiative.ebitda_impact_high === null || initiative.ebitda_impact_high === undefined) {
    violations.push(
      `${label}: ebitda_impact_high is null. §3.1 requires EBITDA impact ranges for every initiative.`,
    );
  }
  if (
    initiative.ebitda_impact_low !== null &&
    initiative.ebitda_impact_low !== undefined &&
    initiative.ebitda_impact_high !== null &&
    initiative.ebitda_impact_high !== undefined &&
    initiative.ebitda_impact_low > initiative.ebitda_impact_high
  ) {
    violations.push(
      `${label}: ebitda_impact_low (${initiative.ebitda_impact_low}) exceeds ` +
        `ebitda_impact_high (${initiative.ebitda_impact_high}).`,
    );
  }
  if (!initiative.initiative || initiative.initiative.trim() === "") {
    violations.push(`${label}: initiative description is missing or empty.`);
  }
  if (!initiative.timeline || initiative.timeline.trim() === "") {
    violations.push(`${label}: timeline is missing or empty.`);
  }
}

/**
 * Benchmark 4 — Value Creation Thesis
 *
 * Checks:
 *   a) near_term and medium_term arrays are non-empty (§3.1 requires both
 *      time horizons to be populated with actionable levers).
 *   b) Every near_term initiative has non-null ebitda_impact_low and
 *      ebitda_impact_high (§3.1 / §5.2).
 *   c) Every medium_term initiative has non-null ebitda_impact_low and
 *      ebitda_impact_high (§3.1 / §5.2).
 *   (exit_positioning items do not require EBITDA impact ranges per §5.4.)
 */
export function checkValueCreation(valueCreation: ISTValueCreation): QualityCheckResult {
  const violations: string[] = [];

  if (!valueCreation.near_term || valueCreation.near_term.length === 0) {
    violations.push(
      "value_creation.near_term is empty. §3.1 requires near-term (12–24 month) " +
        "value creation levers with EBITDA impact ranges.",
    );
  } else {
    valueCreation.near_term.forEach((initiative, idx) => {
      checkInitiativeEbitdaRange(
        initiative,
        `value_creation.near_term[${idx}] ("${initiative.initiative ?? ""}")`,
        violations,
      );
    });
  }

  if (!valueCreation.medium_term || valueCreation.medium_term.length === 0) {
    violations.push(
      "value_creation.medium_term is empty. §3.1 requires medium-term (24–36 month) " +
        "value creation levers with EBITDA impact ranges.",
    );
  } else {
    valueCreation.medium_term.forEach((initiative, idx) => {
      checkInitiativeEbitdaRange(
        initiative,
        `value_creation.medium_term[${idx}] ("${initiative.initiative ?? ""}")`,
        violations,
      );
    });
  }

  return { passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Benchmark 5 — Key questions (PRD §5.2)
// ---------------------------------------------------------------------------

/**
 * Benchmark 5 — Key Questions
 *
 * Checks:
 *   a) key_questions array contains 5–10 items (§5.2).
 *   b) Each question has a non-empty question string.
 *   c) Each question has a non-empty validates string — the parenthetical
 *      noting which risk or thesis element it validates (§5.2).
 */
export function checkKeyQuestions(keyQuestions: ISTKeyQuestion[]): QualityCheckResult {
  const violations: string[] = [];

  if (keyQuestions.length < 5) {
    violations.push(
      `Only ${keyQuestions.length} key question(s) found; §5.2 requires 5–10.`,
    );
  }
  if (keyQuestions.length > 10) {
    violations.push(
      `${keyQuestions.length} key questions found; §5.2 specifies a maximum of 10.`,
    );
  }

  keyQuestions.forEach((kq, idx) => {
    const label = `key_questions[${idx}]`;

    if (!kq.question || kq.question.trim() === "") {
      violations.push(`${label}: question text is missing or empty.`);
    }

    if (!kq.validates || kq.validates.trim() === "") {
      violations.push(
        `${label}: validates is missing or empty. §5.2 requires a parenthetical ` +
          "noting which risk or thesis element each question validates.",
      );
    }
  });

  return { passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Convenience — run all five benchmarks at once
// ---------------------------------------------------------------------------

export interface FullQualityReport {
  snapshot: QualityCheckResult;
  strengths: QualityCheckResult;
  risks: QualityCheckResult;
  value_creation: QualityCheckResult;
  key_questions: QualityCheckResult;
  /** True only when every individual benchmark passed. */
  overall_passed: boolean;
}

/**
 * Runs all five PRD §9.2 quality benchmarks against a complete ISTAnalysis
 * and returns a structured report.
 */
export function runQualityBenchmarks(analysis: ISTAnalysis): FullQualityReport {
  const snapshot = checkSnapshot(analysis.snapshot);
  const strengths = checkStrengths(analysis.strengths);
  const risks = checkRisks(analysis.risks);
  const value_creation = checkValueCreation(analysis.value_creation);
  const key_questions = checkKeyQuestions(analysis.key_questions);

  return {
    snapshot,
    strengths,
    risks,
    value_creation,
    key_questions,
    overall_passed:
      snapshot.passed &&
      strengths.passed &&
      risks.passed &&
      value_creation.passed &&
      key_questions.passed,
  };
}
