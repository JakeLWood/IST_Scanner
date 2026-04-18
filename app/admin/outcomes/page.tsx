/**
 * Admin — Decision Outcome Reporting Page (PRD §8.4)
 *
 * Server Component that:
 * 1. Verifies the user is authenticated and has the "admin" role.
 * 2. Loads all screenings that have a recommendation and/or actual_outcome.
 * 3. Computes three sets of analytics:
 *    a. PROCEED accuracy — % that led to a "pursued" outcome.
 *    b. PASS accuracy    — % that correctly filtered out deals the firm passed on.
 *    c. Dimension calibration — which scoring dimensions score lowest on deals
 *       the firm ultimately pursued, surfacing potential weight miscalibrations.
 * 4. Renders OutcomesClient with the pre-computed data.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OutcomesClient, {
  type OutcomeStats,
  type DimensionMiscalibration,
  type OutcomeBreakdownRow,
} from "./OutcomesClient";

// ---------------------------------------------------------------------------
// Supabase row shape
// ---------------------------------------------------------------------------

interface OutcomeRow {
  id: string;
  company_name: string;
  recommendation: "PROCEED" | "FURTHER_REVIEW" | "PASS" | null;
  actual_outcome:
    | "pursued"
    | "passed"
    | "invested"
    | "currently_in_diligence"
    | "exited"
    | null;
  composite_score: number | null;
  scores_json: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

/**
 * The set of actual_outcome values that represent the firm deciding to pursue
 * a deal (i.e. a "positive" decision).
 */
const PURSUED_OUTCOMES = new Set([
  "pursued",
  "invested",
  "currently_in_diligence",
  "exited",
]);

/**
 * Given a scores_json JSONB blob from the database, extract a flat map of
 * dimension key → numeric score. Handles both the legacy 7-section PE format
 * (where scores_json contains `dimensionScores` at the top level) and any
 * future format.
 */
function extractDimensionScores(
  scoresJson: Record<string, unknown> | null,
): Record<string, number> {
  if (!scoresJson) return {};

  // scores_json stores the ScoringResult which has a `dimensionScores` field
  const raw = scoresJson["dimensionScores"];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number") result[k] = v;
    }
    return result;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadOutcomeData(): Promise<{
  stats: OutcomeStats;
  miscalibrations: DimensionMiscalibration[];
  breakdown: OutcomeBreakdownRow[];
}> {
  const empty = {
    stats: {
      totalWithOutcome: 0,
      proceedTotal: 0,
      proceedPursued: 0,
      proceedAccuracyPct: null,
      passTotal: 0,
      passCorrect: 0,
      passAccuracyPct: null,
      furtherReviewTotal: 0,
      furtherReviewPursued: 0,
    },
    miscalibrations: [],
    breakdown: [],
  };

  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) return empty;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("screenings")
    .select(
      "id, company_name, recommendation, actual_outcome, composite_score, scores_json, created_at",
    )
    .not("recommendation", "is", null)
    .order("created_at", { ascending: false })
    .returns<OutcomeRow[]>();

  if (error || !data) return empty;

  // ── Outcome breakdown table ──────────────────────────────────────────────
  const breakdown: OutcomeBreakdownRow[] = data
    .filter((r) => r.actual_outcome !== null)
    .map((r) => ({
      id: r.id,
      companyName: r.company_name,
      recommendation: r.recommendation!,
      actualOutcome: r.actual_outcome!,
      compositeScore: r.composite_score,
      createdAt: r.created_at,
    }));

  // ── Summary stats ────────────────────────────────────────────────────────
  const rowsWithOutcome = data.filter((r) => r.actual_outcome !== null);

  const proceedRows = rowsWithOutcome.filter(
    (r) => r.recommendation === "PROCEED",
  );
  const proceedPursued = proceedRows.filter((r) =>
    PURSUED_OUTCOMES.has(r.actual_outcome!),
  ).length;

  const passRows = rowsWithOutcome.filter((r) => r.recommendation === "PASS");
  // A PASS recommendation is "correct" when the firm also decided to pass.
  const passCorrect = passRows.filter(
    (r) => r.actual_outcome === "passed",
  ).length;

  const furtherReviewRows = rowsWithOutcome.filter(
    (r) => r.recommendation === "FURTHER_REVIEW",
  );
  const furtherReviewPursued = furtherReviewRows.filter((r) =>
    PURSUED_OUTCOMES.has(r.actual_outcome!),
  ).length;

  const stats: OutcomeStats = {
    totalWithOutcome: rowsWithOutcome.length,
    proceedTotal: proceedRows.length,
    proceedPursued,
    proceedAccuracyPct:
      proceedRows.length > 0
        ? Math.round((proceedPursued / proceedRows.length) * 100)
        : null,
    passTotal: passRows.length,
    passCorrect,
    passAccuracyPct:
      passRows.length > 0
        ? Math.round((passCorrect / passRows.length) * 100)
        : null,
    furtherReviewTotal: furtherReviewRows.length,
    furtherReviewPursued,
  };

  // ── Dimension miscalibration ─────────────────────────────────────────────
  // Find deals that were ultimately pursued but scored low on specific
  // dimensions. A "low" score is defined as < 5. This surfaces dimensions
  // that may be over-weighted (blocking deals the firm wanted) or
  // under-weighted (allowing deals with hidden weaknesses through).

  const pursuedRows = rowsWithOutcome.filter((r) =>
    PURSUED_OUTCOMES.has(r.actual_outcome!),
  );

  // Aggregate: for each dimension, count how many pursued deals had a low score
  const dimensionLowCounts: Record<string, { low: number; total: number }> = {};

  for (const row of pursuedRows) {
    const dimScores = extractDimensionScores(row.scores_json);
    for (const [dim, score] of Object.entries(dimScores)) {
      if (!dimensionLowCounts[dim]) {
        dimensionLowCounts[dim] = { low: 0, total: 0 };
      }
      dimensionLowCounts[dim].total += 1;
      if (score < 5) {
        dimensionLowCounts[dim].low += 1;
      }
    }
  }

  const miscalibrations: DimensionMiscalibration[] = Object.entries(
    dimensionLowCounts,
  )
    .filter(([, { total }]) => total > 0)
    .map(([dimension, { low, total }]) => ({
      dimension,
      lowScoreCount: low,
      totalPursuedCount: total,
      lowScorePct: Math.round((low / total) * 100),
    }))
    .sort((a, b) => b.lowScorePct - a.lowScorePct);

  return { stats, miscalibrations, breakdown };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminOutcomesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  const { stats, miscalibrations, breakdown } = await loadOutcomeData();

  return (
    <OutcomesClient
      stats={stats}
      miscalibrations={miscalibrations}
      breakdown={breakdown}
    />
  );
}
