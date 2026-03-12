"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useState } from "react";
import type {
  ISTAnalysis,
  ISTStrength,
  ISTValueCreation,
  ISTKeyQuestion,
  DealType,
  RecommendationVerdict,
  Severity,
  Likelihood,
  Significance,
} from "@/types/ist-analysis";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500/20 border-emerald-500/40";
  if (score >= 50) return "bg-amber-500/20 border-amber-500/40";
  return "bg-red-500/20 border-red-500/40";
}

function scoreBgSolid(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function verdictConfig(verdict: RecommendationVerdict) {
  switch (verdict) {
    case "PROCEED":
      return {
        label: "Proceed",
        classes: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
      };
    case "FURTHER_REVIEW":
      return {
        label: "Further Review",
        classes: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
      };
    case "PASS":
      return {
        label: "Pass",
        classes: "bg-red-500/20 text-red-300 border border-red-500/40",
      };
  }
}

function dealTypeLabel(dt: DealType): string {
  const map: Record<DealType, string> = {
    traditional_pe: "Traditional PE",
    growth_equity: "Growth Equity",
    venture: "Venture",
    real_estate: "Real Estate",
    credit: "Credit",
    ip_technology: "IP / Technology",
  };
  return map[dt] ?? dt;
}

function severityConfig(s: Severity) {
  switch (s) {
    case "critical":
      return { label: "Critical", classes: "bg-red-600/20 text-red-300 border-red-500/40" };
    case "high":
      return { label: "High", classes: "bg-red-500/20 text-red-300 border-red-500/40" };
    case "medium":
      return { label: "Medium", classes: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
    case "low":
      return { label: "Low", classes: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
  }
}

function likelihoodConfig(l: Likelihood) {
  switch (l) {
    case "high":
      return { label: "High", classes: "text-red-300" };
    case "medium":
      return { label: "Medium", classes: "text-amber-300" };
    case "low":
      return { label: "Low", classes: "text-emerald-300" };
  }
}

function significanceConfig(s: Significance) {
  switch (s) {
    case "high":
      return {
        label: "High Impact",
        classes: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
      };
    case "medium":
      return {
        label: "Medium Impact",
        classes: "bg-slate-500/20 text-slate-300 border-slate-500/40",
      };
    case "low":
      return {
        label: "Low Impact",
        classes: "bg-slate-600/20 text-slate-400 border-slate-600/40",
      };
  }
}

function formatCurrency(val: number | undefined): string {
  if (val === undefined || val === null) return "—";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatPct(val: number | undefined): string {
  if (val === undefined || val === null) return "—";
  return `${val.toFixed(1)}%`;
}

function formatMultiple(val: number | undefined): string {
  if (val === undefined || val === null) return "—";
  return `${val.toFixed(1)}x`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full ${scoreBgSolid(score)}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function DimensionCard({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${scoreBg(score)}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <span className={`text-xl font-bold font-mono ${scoreColor(score)}`}>
          {score}
        </span>
      </div>
      <ScoreBar score={score} />
    </div>
  );
}

function StrengthCard({ strength }: { strength: ISTStrength }) {
  const sig = significanceConfig(strength.significance);
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="font-semibold text-slate-100 text-sm leading-snug">
          {strength.title}
        </h4>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${sig.classes}`}
        >
          {sig.label}
        </span>
      </div>
      <p className="text-slate-400 text-sm leading-relaxed">
        {strength.description}
      </p>
    </div>
  );
}


function ValueCreationCard({ item }: { item: ISTValueCreation }) {
  const timeframeLabel: Record<string, string> = {
    short: "Short-term",
    medium: "Medium-term",
    long: "Long-term",
  };
  const potentialLabel: Record<string, string> = {
    high: "High Potential",
    medium: "Medium Potential",
    low: "Low Potential",
  };
  const potentialColors: Record<string, string> = {
    high: "text-emerald-400",
    medium: "text-amber-400",
    low: "text-slate-400",
  };
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="font-semibold text-slate-100 text-sm">{item.title}</h4>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
            {timeframeLabel[item.timeframe] ?? item.timeframe}
          </span>
          <span className={`text-xs font-medium ${potentialColors[item.potential] ?? "text-slate-400"}`}>
            {potentialLabel[item.potential] ?? item.potential}
          </span>
        </div>
      </div>
      <p className="text-slate-400 text-sm leading-relaxed">{item.description}</p>
    </div>
  );
}

function KeyQuestionCard({ q }: { q: ISTKeyQuestion }) {
  const priorityColors: Record<string, string> = {
    high: "text-red-400",
    medium: "text-amber-400",
    low: "text-slate-400",
  };
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0 mt-1.5" />
        <div className="flex-1">
          <p className="text-slate-100 text-sm font-medium mb-1">{q.question}</p>
          <p className="text-slate-400 text-xs leading-relaxed mb-2">{q.rationale}</p>
          <div className="flex items-center gap-3 text-xs">
            <span className={`font-medium ${priorityColors[q.priority] ?? "text-slate-400"}`}>
              {q.priority.charAt(0).toUpperCase() + q.priority.slice(1)} Priority
            </span>
            {q.owner && (
              <span className="text-slate-500">
                Owner: <span className="text-slate-300">{q.owner}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar Chart
// ---------------------------------------------------------------------------

function ScoreRadarChart({ analysis }: { analysis: ISTAnalysis }) {
  const { score } = analysis;
  const dimensions = [
    { subject: "Market", value: score.market },
    { subject: "Management", value: score.management },
    { subject: "Financials", value: score.financials },
    { subject: "Strategic Fit", value: score.strategic_fit },
    ...(score.ip_technology !== null && score.ip_technology !== undefined
      ? [{ subject: "IP/Tech", value: score.ip_technology }]
      : []),
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={dimensions} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: "#94a3b8", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}
        />
        <Radar
          name="Score"
          dataKey="value"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
          }}
          formatter={(value) => [`${value}`, "Score"]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export interface ScreeningResultsPageProps {
  analysis: ISTAnalysis;
  screeningId: string;
}

export default function ScreeningResultsPage({
  analysis,
  screeningId,
}: ScreeningResultsPageProps) {
  const [rawExpanded, setRawExpanded] = useState(false);

  const { score, recommendation } = analysis;
  const verdict = verdictConfig(recommendation.verdict);

  // Build dimension score list sorted lowest-first
  const dimensions: { label: string; score: number }[] = [
    { label: "Market", score: score.market },
    { label: "Management", score: score.management },
    { label: "Financials", score: score.financials },
    { label: "Strategic Fit", score: score.strategic_fit },
    ...(score.ip_technology !== null && score.ip_technology !== undefined
      ? [{ label: "IP / Technology", score: score.ip_technology }]
      : []),
  ].sort((a, b) => a.score - b.score);

  const metrics = analysis.snapshot_metrics ?? {};

  const metricItems = [
    { label: "Revenue", value: formatCurrency(metrics.revenue_usd) },
    { label: "EBITDA", value: formatCurrency(metrics.ebitda_usd) },
    { label: "EBITDA Margin", value: formatPct(metrics.ebitda_margin_pct) },
    { label: "Revenue Growth", value: formatPct(metrics.revenue_growth_pct) },
    { label: "Enterprise Value", value: formatCurrency(metrics.enterprise_value_usd) },
    { label: "EV / Revenue", value: formatMultiple(metrics.ev_revenue_multiple) },
    { label: "EV / EBITDA", value: formatMultiple(metrics.ev_ebitda_multiple) },
    { label: "Debt / EBITDA", value: formatMultiple(metrics.debt_to_ebitda) },
    { label: "IRR Target", value: formatPct(metrics.irr_target_pct) },
    { label: "MOIC Target", value: formatMultiple(metrics.moic_target) },
  ];

  // Sort risks by severity criticality
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const sortedRisks = [...analysis.risks].sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ------------------------------------------------------------------ */}
      {/* STICKY HEADER                                                        */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-3">
            {/* Left: Company info */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-100 truncate leading-tight">
                  {analysis.company_name}
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  {/* Deal type badge */}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 whitespace-nowrap">
                    {dealTypeLabel(analysis.deal_type)}
                  </span>
                  {/* Recommendation badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${verdict.classes}`}>
                    {verdict.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Center: Composite score */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-center">
                <div
                  className={`text-4xl font-bold font-mono leading-none ${scoreColor(score.overall)}`}
                >
                  {score.overall}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">/ 100</div>
              </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                onClick={() => window.print()}
                title="Export PDF"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export PDF
              </button>
              <button
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                onClick={() => navigator.clipboard.writeText(window.location.href)}
                title="Share"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
              <button
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                title="Add to DealFlow"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add to DealFlow
              </button>
              <button
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN CONTENT                                                         */}
      {/* ------------------------------------------------------------------ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">

        {/* Executive Summary */}
        <section>
          <p className="text-slate-300 leading-relaxed text-sm">
            {analysis.executive_summary}
          </p>
          {recommendation.has_disqualifier && recommendation.disqualifier_reason && (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm">
              <span className="font-semibold">⚠ Disqualifier: </span>
              {recommendation.disqualifier_reason}
            </div>
          )}
          {recommendation.conditions.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-amber-300 font-semibold text-sm mb-2">Conditions</p>
              <ul className="space-y-1">
                {recommendation.conditions.map((c, i) => (
                  <li key={i} className="text-amber-200 text-sm flex gap-2">
                    <span className="text-amber-500 shrink-0">•</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* INVESTMENT SNAPSHOT METRICS GRID                                  */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-base font-semibold text-slate-200 mb-4 uppercase tracking-wider text-xs">
            Investment Snapshot
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {metricItems.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center"
              >
                <div className="text-xl font-bold font-mono text-slate-100">{m.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SCORE RADAR + DIMENSION CARDS                                      */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
            Score Analysis
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Score Radar</h3>
              <ScoreRadarChart analysis={analysis} />
            </div>

            {/* Dimension Score Cards — sorted lowest-first */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-slate-300">
                Dimension Scores
                <span className="text-xs font-normal text-slate-500 ml-2">(lowest first)</span>
              </h3>
              {dimensions.map((d) => (
                <DimensionCard key={d.label} label={d.label} score={d.score} />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* STRENGTHS                                                          */}
        {/* ---------------------------------------------------------------- */}
        {analysis.strengths.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
              Strengths
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {analysis.strengths.map((s, i) => (
                <StrengthCard key={i} strength={s} />
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* RISK TABLE                                                         */}
        {/* ---------------------------------------------------------------- */}
        {sortedRisks.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
              Risk Assessment
            </h2>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-700/30">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Risk
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                        Severity
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                        Likelihood
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Mitigation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="px-4">
                    {sortedRisks.map((r, i) => (
                      <tr key={i} className="border-b border-slate-700/60 last:border-0">
                        <td className="py-3 px-4 align-top">
                          <span className="font-medium text-slate-200 text-sm">{r.title}</span>
                          <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{r.description}</p>
                        </td>
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${severityConfig(r.severity).classes}`}>
                            {severityConfig(r.severity).label}
                          </span>
                        </td>
                        <td className={`py-3 px-4 align-top text-sm font-medium ${likelihoodConfig(r.likelihood).classes}`}>
                          {likelihoodConfig(r.likelihood).label}
                        </td>
                        <td className="py-3 px-4 align-top text-slate-400 text-xs leading-relaxed">
                          {r.mitigation ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* VALUE CREATION                                                     */}
        {/* ---------------------------------------------------------------- */}
        {analysis.value_creation.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
              Value Creation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {analysis.value_creation.map((v, i) => (
                <ValueCreationCard key={i} item={v} />
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* KEY QUESTIONS                                                      */}
        {/* ---------------------------------------------------------------- */}
        {analysis.key_questions.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
              Key Questions
            </h2>
            <div className="space-y-3">
              {analysis.key_questions.map((q, i) => (
                <KeyQuestionCard key={i} q={q} />
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* DATA QUALITY                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
            Data Quality
          </h2>
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
            <div className="flex flex-wrap gap-4 mb-4">
              <div>
                <span className="text-xs text-slate-500">Confidence</span>
                <div className="mt-0.5">
                  <span
                    className={`text-sm font-semibold capitalize ${
                      analysis.data_quality.confidence === "high"
                        ? "text-emerald-400"
                        : analysis.data_quality.confidence === "medium"
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {analysis.data_quality.confidence}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Completeness</span>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-200">
                    {analysis.data_quality.completeness_pct}%
                  </span>
                  <div className="w-24 bg-slate-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${scoreBgSolid(analysis.data_quality.completeness_pct)}`}
                      style={{ width: `${analysis.data_quality.completeness_pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            {analysis.data_quality.missing_data.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-slate-400 mb-1.5">Missing Data</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.data_quality.missing_data.map((d, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {analysis.data_quality.caveats.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1.5">Caveats</p>
                <ul className="space-y-1">
                  {analysis.data_quality.caveats.map((c, i) => (
                    <li key={i} className="text-slate-400 text-xs flex gap-2">
                      <span className="text-slate-600 shrink-0">•</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* COLLAPSIBLE RAW DOCUMENT                                          */}
        {/* ---------------------------------------------------------------- */}
        {analysis.raw_document && (
          <section>
            <button
              onClick={() => setRawExpanded((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${rawExpanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Raw Document
            </button>
            {rawExpanded && (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-5 overflow-x-auto">
                <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
                  {analysis.raw_document}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* Screening ID footer */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between text-xs text-slate-600">
          <span>Screening ID: {screeningId}</span>
          <span>Generated: {new Date(analysis.generated_at).toLocaleString()}</span>
        </div>
      </main>
    </div>
  );
}
