"use client";

/**
 * OutcomesClient — Decision Outcome Reporting UI (PRD §8.4)
 *
 * Displays three panels:
 * 1. Summary accuracy stats (PROCEED precision, PASS precision).
 * 2. Dimension miscalibration table — which dimensions score low on deals
 *    the firm ultimately pursued, suggesting potential weight adjustments.
 * 3. Full outcome breakdown table — every screening with a recorded outcome.
 */

import { useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types (exported so the server component can use them)
// ---------------------------------------------------------------------------

export interface OutcomeStats {
  totalWithOutcome: number;
  proceedTotal: number;
  proceedPursued: number;
  /** null when proceedTotal === 0 */
  proceedAccuracyPct: number | null;
  passTotal: number;
  passCorrect: number;
  /** null when passTotal === 0 */
  passAccuracyPct: number | null;
  furtherReviewTotal: number;
  furtherReviewPursued: number;
}

export interface DimensionMiscalibration {
  dimension: string;
  lowScoreCount: number;
  totalPursuedCount: number;
  /** Percentage of pursued deals where this dimension scored < 5 */
  lowScorePct: number;
}

export interface OutcomeBreakdownRow {
  id: string;
  companyName: string;
  recommendation: "PROCEED" | "FURTHER_REVIEW" | "PASS";
  actualOutcome:
    | "pursued"
    | "passed"
    | "invested"
    | "currently_in_diligence"
    | "exited";
  compositeScore: number | null;
  createdAt: string;
}

interface OutcomesClientProps {
  stats: OutcomeStats;
  miscalibrations: DimensionMiscalibration[];
  breakdown: OutcomeBreakdownRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  companyOverview: "Company Overview",
  marketOpportunity: "Market Opportunity",
  financialProfile: "Financial Profile",
  managementTeam: "Management Team",
  investmentThesis: "Investment Thesis",
  riskAssessment: "Risk Assessment",
  dealDynamics: "Deal Dynamics",
  technologyReadiness: "Technology Readiness",
  ipStrengthDefensibility: "IP Strength & Defensibility",
  commercializationPathway: "Commercialization Pathway",
  orthogonalApplicationPotential: "Orthogonal Application Potential",
};

function dimensionLabel(key: string): string {
  return DIMENSION_LABELS[key] ?? key;
}

const OUTCOME_LABELS: Record<string, string> = {
  pursued: "Pursued",
  passed: "Passed",
  invested: "Invested",
  currently_in_diligence: "In Diligence",
  exited: "Exited",
};

function outcomeBadgeClasses(outcome: string): string {
  switch (outcome) {
    case "invested":
    case "exited":
      return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
    case "pursued":
    case "currently_in_diligence":
      return "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40";
    case "passed":
    default:
      return "bg-slate-600/40 text-slate-400 border border-slate-500/40";
  }
}

function recommendationBadgeClasses(rec: string): string {
  switch (rec) {
    case "PROCEED":
      return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
    case "FURTHER_REVIEW":
      return "bg-amber-500/20 text-amber-300 border border-amber-500/40";
    case "PASS":
      return "bg-red-500/20 text-red-300 border border-red-500/40";
    default:
      return "bg-slate-700 text-slate-400 border border-slate-600";
  }
}

function recommendationLabel(rec: string): string {
  switch (rec) {
    case "PROCEED":
      return "Proceed";
    case "FURTHER_REVIEW":
      return "Further Review";
    case "PASS":
      return "Pass";
    default:
      return rec;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function pctColor(pct: number): string {
  if (pct >= 70) return "text-emerald-400";
  if (pct >= 40) return "text-amber-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  subtext,
  color,
}: {
  title: string;
  value: string;
  subtext: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {title}
      </p>
      <p className={`text-3xl font-bold font-mono leading-none ${color ?? "text-slate-100"}`}>
        {value}
      </p>
      <p className="text-xs text-slate-500 mt-1.5">{subtext}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OutcomesClient({
  stats,
  miscalibrations,
  breakdown,
}: OutcomesClientProps) {
  const [showAllBreakdown, setShowAllBreakdown] = useState(false);

  const visibleBreakdown = showAllBreakdown
    ? breakdown
    : breakdown.slice(0, 20);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-100">
              Decision Outcome Reporting
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              PRD §8.4 — Screening accuracy and calibration analytics
            </p>
          </div>
          <nav className="flex items-center gap-2 text-xs">
            <Link
              href="/admin/settings"
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">

        {/* ── Data coverage notice ── */}
        {stats.totalWithOutcome === 0 ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-center">
            <p className="text-amber-300 font-semibold text-sm mb-1">
              No outcome data recorded yet
            </p>
            <p className="text-amber-400/70 text-xs max-w-md mx-auto">
              Open a screening record and set its &ldquo;Actual Outcome&rdquo; field to
              start populating this report. Analytics become meaningful once at
              least 5–10 outcomes are recorded.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 px-4 py-2 text-xs text-slate-400">
            Based on{" "}
            <span className="font-semibold text-slate-200">
              {stats.totalWithOutcome}
            </span>{" "}
            screening{stats.totalWithOutcome !== 1 ? "s" : ""} with recorded
            outcomes.
          </div>
        )}

        {/* ── Section 1: Accuracy Summary ── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Recommendation Accuracy
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="PROCEED Precision"
              value={
                stats.proceedAccuracyPct !== null
                  ? `${stats.proceedAccuracyPct}%`
                  : "—"
              }
              subtext={`${stats.proceedPursued} of ${stats.proceedTotal} PROCEED recommendations led to pursuit`}
              color={
                stats.proceedAccuracyPct !== null
                  ? pctColor(stats.proceedAccuracyPct)
                  : "text-slate-500"
              }
            />
            <StatCard
              title="PASS Precision"
              value={
                stats.passAccuracyPct !== null
                  ? `${stats.passAccuracyPct}%`
                  : "—"
              }
              subtext={`${stats.passCorrect} of ${stats.passTotal} PASS recommendations correctly filtered deals`}
              color={
                stats.passAccuracyPct !== null
                  ? pctColor(stats.passAccuracyPct)
                  : "text-slate-500"
              }
            />
            <StatCard
              title="Further Review → Pursued"
              value={
                stats.furtherReviewTotal > 0
                  ? `${Math.round((stats.furtherReviewPursued / stats.furtherReviewTotal) * 100)}%`
                  : "—"
              }
              subtext={`${stats.furtherReviewPursued} of ${stats.furtherReviewTotal} Further Review deals were ultimately pursued`}
            />
            <StatCard
              title="Total with Outcomes"
              value={String(stats.totalWithOutcome)}
              subtext="Screenings with a recorded actual outcome"
            />
          </div>

          {/* Precision explanation */}
          {(stats.proceedTotal > 0 || stats.passTotal > 0) && (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/30 p-4 text-xs text-slate-400 space-y-1">
              <p>
                <span className="text-emerald-400 font-semibold">PROCEED Precision</span>{" "}
                — what % of deals the screener said &ldquo;Proceed&rdquo; on were actually
                pursued. A low score means the screener may be too permissive.
              </p>
              <p>
                <span className="text-red-400 font-semibold">PASS Precision</span>{" "}
                — what % of deals the screener said &ldquo;Pass&rdquo; on were also passed
                by the firm. A low score means the screener may be filtering out
                deals the firm actually wanted.
              </p>
            </div>
          )}
        </section>

        {/* ── Section 2: Dimension Miscalibration ── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Dimension Miscalibration Analysis
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Dimensions that frequently score low (&lt;5) on deals the firm
            ultimately pursued — these may be over-weighted, causing the
            screener to discourage deals the firm finds attractive. Higher
            percentages warrant admin review of scoring weights.
          </p>

          {miscalibrations.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-6 text-center text-slate-500 text-sm">
              {stats.totalWithOutcome === 0
                ? "Record outcomes on pursued deals to see miscalibration analysis."
                : "No dimension miscalibrations detected with current data."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Dimension
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Low-score Rate on Pursued Deals
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Low-score Count
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Sample Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Signal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950">
                  {miscalibrations.map((row) => (
                    <tr key={row.dimension}>
                      <td className="px-4 py-3 font-medium text-slate-200">
                        {dimensionLabel(row.dimension)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 bg-slate-700 rounded-full h-1.5 hidden sm:block">
                            <div
                              className={`h-1.5 rounded-full ${
                                row.lowScorePct >= 50
                                  ? "bg-red-500"
                                  : row.lowScorePct >= 25
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                              style={{ width: `${row.lowScorePct}%` }}
                            />
                          </div>
                          <span
                            className={`font-mono font-semibold ${
                              row.lowScorePct >= 50
                                ? "text-red-400"
                                : row.lowScorePct >= 25
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                            }`}
                          >
                            {row.lowScorePct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400">
                        {row.lowScoreCount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        {row.totalPursuedCount}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {row.lowScorePct >= 50 ? (
                          <span className="text-red-400 font-medium">
                            ⚠ Review weight — high miscalibration
                          </span>
                        ) : row.lowScorePct >= 25 ? (
                          <span className="text-amber-400">
                            Monitor — possible miscalibration
                          </span>
                        ) : (
                          <span className="text-emerald-400">Calibrated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {miscalibrations.some((m) => m.lowScorePct >= 25) && (
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/30 p-3 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">
                Next step:{" "}
              </span>
              Review flagged dimensions in{" "}
              <Link
                href="/admin/settings"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                Admin → Scoring Weights
              </Link>{" "}
              and consider reducing the weight of over-penalising dimensions.
            </div>
          )}
        </section>

        {/* ── Section 3: Outcome Breakdown Table ── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Outcome Breakdown
          </h2>

          {breakdown.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-6 text-center text-slate-500 text-sm">
              No outcomes recorded yet. Open individual screening records to
              set their actual outcome.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Company
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        AI Recommendation
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Actual Outcome
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Score
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Alignment
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950">
                    {visibleBreakdown.map((row) => {
                      const pursued = [
                        "pursued",
                        "invested",
                        "currently_in_diligence",
                        "exited",
                      ].includes(row.actualOutcome);
                      const aligned =
                        (row.recommendation === "PROCEED" && pursued) ||
                        (row.recommendation === "PASS" &&
                          row.actualOutcome === "passed");
                      const misaligned =
                        (row.recommendation === "PROCEED" &&
                          row.actualOutcome === "passed") ||
                        (row.recommendation === "PASS" && pursued);

                      return (
                        <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-200">
                            <Link
                              href={`/screenings/${row.id}`}
                              className="hover:text-indigo-300 transition-colors"
                            >
                              {row.companyName}
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                            {formatDate(row.createdAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${recommendationBadgeClasses(row.recommendation)}`}
                            >
                              {recommendationLabel(row.recommendation)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${outcomeBadgeClasses(row.actualOutcome)}`}
                            >
                              {OUTCOME_LABELS[row.actualOutcome] ??
                                row.actualOutcome}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300">
                            {row.compositeScore !== null
                              ? row.compositeScore.toFixed(1)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            {aligned ? (
                              <span className="text-emerald-400">
                                ✓ Aligned
                              </span>
                            ) : misaligned ? (
                              <span className="text-red-400">✗ Misaligned</span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {breakdown.length > 20 && (
                <div className="mt-3 text-center">
                  <button
                    onClick={() => setShowAllBreakdown((v) => !v)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    {showAllBreakdown
                      ? "Show fewer"
                      : `Show all ${breakdown.length} records`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
