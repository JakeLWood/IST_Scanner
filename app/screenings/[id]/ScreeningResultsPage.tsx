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
  ISTSection,
  TechnologyReadiness,
  IPStrengthDefensibility,
  CommercializationPathway,
  OrthogonalApplicationPotential,
} from "@/types/ist-analysis";
import type {
  ScoringResult,
  FinalRecommendation,
  ISTDimension,
} from "@/lib/scoringEngine";

// ---------------------------------------------------------------------------
// Helpers — colour coding (1–10 scale)
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 7) return "text-emerald-400";
  if (score >= 5) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 7) return "bg-emerald-500/20 border-emerald-500/40";
  if (score >= 5) return "bg-amber-500/20 border-amber-500/40";
  return "bg-red-500/20 border-red-500/40";
}

function scoreBgSolid(score: number): string {
  if (score >= 7) return "bg-emerald-500";
  if (score >= 5) return "bg-amber-500";
  return "bg-red-500";
}

/** Convert a 1–10 integer score to a 0–100 percentage for progress bars. */
function scoreToPercent(score: number): number {
  return Math.round(((score - 1) / 9) * 100);
}

function compositeColor(score: number): string {
  // compositeScore is 1–10
  if (score >= 7) return "text-emerald-400";
  if (score >= 5) return "text-amber-400";
  return "text-red-400";
}

function verdictConfig(verdict: FinalRecommendation) {
  switch (verdict) {
    case "PROCEED":
      return {
        label: "Proceed",
        classes:
          "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
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

function dealTypeLabel(dt: string): string {
  const map: Record<string, string> = {
    traditional_pe: "Traditional PE",
    growth_equity: "Growth Equity",
    venture: "Venture",
    real_estate: "Real Estate",
    credit: "Credit",
    ip_technology: "IP / Technology",
  };
  return map[dt] ?? dt;
}

const DIMENSION_LABELS: Record<ISTDimension, string> = {
  companyOverview: "Company Overview",
  marketOpportunity: "Market Opportunity",
  financialProfile: "Financial Profile",
  managementTeam: "Management Team",
  investmentThesis: "Investment Thesis",
  riskAssessment: "Risk Assessment",
  dealDynamics: "Deal Dynamics",
};

const DIMENSIONS: ISTDimension[] = [
  "companyOverview",
  "marketOpportunity",
  "financialProfile",
  "managementTeam",
  "investmentThesis",
  "riskAssessment",
  "dealDynamics",
];

// ---------------------------------------------------------------------------
// IP / Technology track — dimension definitions (PRD §3.4)
// ---------------------------------------------------------------------------

/** Dimension keys shown in the Investment Snapshot and Score Analysis for IP deals. */
type IPSnapshotKey =
  | "technologyReadiness"
  | "ipStrengthDefensibility"
  | "marketOpportunity"
  | "commercializationPathway"
  | "orthogonalApplicationPotential"
  | "valueCreationPotential"
  | "riskProfile"
  | "managementTeam"
  | "strategicFit";

const IP_DIMENSION_LABELS: Record<IPSnapshotKey, string> = {
  technologyReadiness: "Technology Readiness",
  ipStrengthDefensibility: "IP Strength & Defensibility",
  marketOpportunity: "Market Attractiveness",
  commercializationPathway: "Commercialization Pathway",
  orthogonalApplicationPotential: "Orthogonal Application Potential",
  valueCreationPotential: "Value Creation Potential",
  riskProfile: "Risk Profile",
  managementTeam: "Management Team",
  strategicFit: "Strategic Fit",
};

const IP_SNAPSHOT_KEYS: IPSnapshotKey[] = [
  "technologyReadiness",
  "ipStrengthDefensibility",
  "marketOpportunity",
  "commercializationPathway",
  "orthogonalApplicationPotential",
  "valueCreationPotential",
  "riskProfile",
  "managementTeam",
  "strategicFit",
];

/** Resolve a numeric score for each IP snapshot dimension from the analysis. */
function getIPDimensionScores(
  analysis: ISTAnalysis,
): Record<IPSnapshotKey, number | null> {
  return {
    technologyReadiness: analysis.technologyReadiness?.score ?? null,
    ipStrengthDefensibility: analysis.ipStrengthDefensibility?.score ?? null,
    marketOpportunity: analysis.marketOpportunity?.score ?? null,
    commercializationPathway: analysis.commercializationPathway?.score ?? null,
    orthogonalApplicationPotential:
      analysis.orthogonalApplicationPotential?.score ?? null,
    // investmentThesis proxies "Value Creation Potential"
    valueCreationPotential: analysis.investmentThesis?.score ?? null,
    riskProfile: analysis.riskAssessment?.score ?? null,
    managementTeam: analysis.managementTeam?.score ?? null,
    // companyOverview proxies "Strategic Fit"
    strategicFit: analysis.companyOverview?.score ?? null,
  };
}

// ---------------------------------------------------------------------------
// TRL labels (NASA scale, 1–9) — PRD §3.4
// ---------------------------------------------------------------------------

const TRL_LABELS: Record<number, string> = {
  1: "Basic Principles",
  2: "Concept Formulated",
  3: "Proof of Concept",
  4: "Lab Validation",
  5: "Relevant Environment",
  6: "System Demo",
  7: "Operational Prototype",
  8: "System Qualified",
  9: "Fully Deployed",
};

// Score label bands (1–10)
function scoreBand(score: number): string {
  if (score >= 7) return "Strong";
  if (score >= 5) return "Adequate";
  if (score >= 3) return "Concerning";
  return "Deal-breaking";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBar({ score }: { score: number }) {
  const pct = scoreToPercent(score);
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full ${scoreBgSolid(score)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function DimensionCard({
  label,
  section,
}: {
  label: string;
  section: ISTSection;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border p-4 ${scoreBg(section.score)}`}>
      <button
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-slate-200">{label}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{scoreBand(section.score)}</span>
            <span
              className={`text-2xl font-bold font-mono leading-none ${scoreColor(section.score)}`}
            >
              {section.score}
            </span>
            <span className="text-slate-500 text-xs">/10</span>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <ScoreBar score={section.score} />
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          <p className="text-slate-300 text-sm leading-relaxed">{section.commentary}</p>
          {section.keyFindings.length > 0 && (
            <ul className="space-y-1 mt-2">
              {section.keyFindings.map((f, i) => (
                <li key={i} className="flex gap-2 text-slate-400 text-xs leading-relaxed">
                  <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCommentaryCard({
  label,
  section,
}: {
  label: string;
  section: ISTSection;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="font-semibold text-slate-100 text-sm">{label}</h4>
        <span
          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${scoreBg(section.score)} ${scoreColor(section.score)}`}
        >
          {section.score}/10
        </span>
      </div>
      <p className="text-slate-400 text-sm leading-relaxed mb-3">
        {section.commentary}
      </p>
      {section.keyFindings.length > 0 && (
        <ul className="space-y-1">
          {section.keyFindings.map((f, i) => (
            <li key={i} className="flex gap-2 text-slate-300 text-xs leading-relaxed">
              <span className="text-indigo-400 shrink-0">•</span>
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar Chart
// ---------------------------------------------------------------------------

function ScoreRadarChart({
  data,
}: {
  data: { subject: string; value: number; fullMark: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{
            fill: "#94a3b8",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
          }}
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
          formatter={(value) => [`${value} / 10`, "Score"]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// IP / Technology — specialised components (PRD §3.4)
// ---------------------------------------------------------------------------

/**
 * TRL Gauge — visual representation of Technology Readiness Level (1–9).
 * The active level and all levels below it are coloured by maturity band.
 */
function TRLGauge({ section }: { section: TechnologyReadiness }) {
  const { score, trlLevel, commentary, keyFindings } = section;
  // trlLevel is canonical (1–9 NASA scale). If absent, estimate from score.
  const trl = trlLevel ?? Math.max(1, Math.min(9, Math.round((score / 10) * 9)));

  function trlColor(level: number) {
    if (level >= 7) return "bg-emerald-500 text-white";
    if (level >= 4) return "bg-amber-500 text-white";
    return "bg-red-500 text-white";
  }
  function trlInactive() {
    return "bg-slate-700/60 text-slate-500";
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="font-semibold text-slate-100 text-sm">
          Technology Readiness Level
        </h3>
        <span
          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${scoreBg(score)} ${scoreColor(score)}`}
        >
          {score}/10
        </span>
      </div>

      {/* Step gauge — 9 cells */}
      <div className="flex gap-1 mb-3">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((level) => (
          <div
            key={level}
            className={`flex-1 flex flex-col items-center gap-1 rounded-md py-2 text-xs font-mono font-bold transition-colors ${
              level <= trl ? trlColor(level) : trlInactive()
            }`}
          >
            <span>{level}</span>
          </div>
        ))}
      </div>

      {/* Current level label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">TRL 1 — Basic Principles</span>
        <span
          className={`text-sm font-bold font-mono ${
            trl >= 7
              ? "text-emerald-400"
              : trl >= 4
                ? "text-amber-400"
                : "text-red-400"
          }`}
        >
          TRL {trl} — {TRL_LABELS[trl] ?? ""}
        </span>
        <span className="text-xs text-slate-500">TRL 9 — Deployed</span>
      </div>

      <p className="text-slate-400 text-sm leading-relaxed mb-3">{commentary}</p>
      {keyFindings.length > 0 && (
        <ul className="space-y-1">
          {keyFindings.map((f, i) => (
            <li key={i} className="flex gap-2 text-slate-300 text-xs leading-relaxed">
              <span className="text-indigo-400 shrink-0">•</span>
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** IP Strength & Defensibility card — patent portfolio, trade secrets, FTO, etc. */
function IPStrengthCard({ section }: { section: IPStrengthDefensibility }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border p-5 ${scoreBg(section.score)}`}>
      <button className="w-full text-left" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-100 text-sm">
            IP Strength &amp; Defensibility
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{scoreBand(section.score)}</span>
            <span
              className={`text-2xl font-bold font-mono leading-none ${scoreColor(section.score)}`}
            >
              {section.score}
            </span>
            <span className="text-slate-500 text-xs">/10</span>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <ScoreBar score={section.score} />
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          <p className="text-slate-300 text-sm leading-relaxed">{section.commentary}</p>
          {section.keyFindings.length > 0 && (
            <ul className="space-y-1 mt-2">
              {section.keyFindings.map((f, i) => (
                <li key={i} className="flex gap-2 text-slate-400 text-xs leading-relaxed">
                  <span className="text-indigo-400 shrink-0 mt-0.5">🛡</span>
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Commercialization Pathway — timeline of phases to revenue. */
function CommercializationTimeline({ section }: { section: CommercializationPathway }) {
  const phases = section.phaseTimeline ?? [];
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-slate-100 text-sm">
          Commercialization Pathway
        </h3>
        <span
          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${scoreBg(section.score)} ${scoreColor(section.score)}`}
        >
          {section.score}/10
        </span>
      </div>
      <p className="text-slate-400 text-sm leading-relaxed mb-4">{section.commentary}</p>

      {phases.length > 0 && (
        <ol className="relative border-l border-indigo-500/40 ml-2 space-y-4">
          {phases.map((phase, i) => (
            <li key={i} className="ml-5">
              <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 ring-2 ring-slate-900 text-white text-xs font-bold">
                {i + 1}
              </span>
              <p className="text-slate-300 text-sm leading-relaxed">{phase}</p>
            </li>
          ))}
        </ol>
      )}

      {section.keyFindings.length > 0 && (
        <ul className="space-y-1 mt-4">
          {section.keyFindings.map((f, i) => (
            <li key={i} className="flex gap-2 text-slate-300 text-xs leading-relaxed">
              <span className="text-indigo-400 shrink-0">→</span>
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Orthogonal Applications — adjacent markets with TAM estimates (PRD §3.4). */
function OrthogonalApplicationsSection({
  section,
}: {
  section: OrthogonalApplicationPotential;
}) {
  const markets = section.adjacentMarkets ?? [];
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
        Orthogonal Applications
      </h2>
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-slate-400 text-sm leading-relaxed">
            {section.commentary}
          </p>
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${scoreBg(section.score)} ${scoreColor(section.score)}`}
          >
            {section.score}/10
          </span>
        </div>

        {markets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {markets.map((m, i) => (
              <div
                key={i}
                className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-slate-200 text-sm">{m.market}</h4>
                  <span className="text-xs font-mono text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
                    {m.tamEstimate}
                  </span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">{m.rationale}</p>
              </div>
            ))}
          </div>
        )}

        {section.keyFindings.length > 0 && (
          <ul className="space-y-1 mt-4">
            {section.keyFindings.map((f, i) => (
              <li key={i} className="flex gap-2 text-slate-300 text-xs leading-relaxed">
                <span className="text-indigo-400 shrink-0">•</span>
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export interface ScreeningResultsPageProps {
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  screeningId: string;
  rawDocumentText?: string | null;
}

export default function ScreeningResultsPage({
  analysis,
  scoringResult,
  screeningId,
  rawDocumentText,
}: ScreeningResultsPageProps) {
  const [rawExpanded, setRawExpanded] = useState(false);

  const { compositeScore, recommendation, isDisqualified, disqualifierReason, dimensionScores } =
    scoringResult;

  const verdict = verdictConfig(recommendation);
  const isIPTech = analysis.dealType === "ip_technology";

  // ---- PE track: 7 sections sorted lowest-first ----
  const sortedDimensions = [...DIMENSIONS].sort(
    (a, b) => dimensionScores[a] - dimensionScores[b]
  );

  // ---- IP track: per-dimension scores from analysis fields ----
  const ipDimensionScores = isIPTech ? getIPDimensionScores(analysis) : null;

  // Radar data — varies by track
  const radarData = isIPTech && ipDimensionScores
    ? IP_SNAPSHOT_KEYS
        .map((k) => ({
          subject: IP_DIMENSION_LABELS[k].replace(" ", "\n"),
          value: ipDimensionScores[k] ?? 0,
          fullMark: 10,
        }))
        .filter((d) => d.value > 0)
    : DIMENSIONS.map((d) => ({
        subject: DIMENSION_LABELS[d].replace(" ", "\n"),
        value: dimensionScores[d],
        fullMark: 10,
      }));

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
                  {analysis.companyName}
                </h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {/* Deal type badge */}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 whitespace-nowrap">
                    {dealTypeLabel(analysis.dealType)}
                  </span>
                  {/* Recommendation badge */}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${verdict.classes}`}
                  >
                    {verdict.label}
                  </span>
                  {isDisqualified && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 border border-red-500/40 whitespace-nowrap">
                      Disqualified
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Center: Composite score */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-center">
                <div
                  className={`text-4xl font-bold font-mono leading-none ${compositeColor(compositeScore)}`}
                >
                  {compositeScore.toFixed(1)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">/ 10</div>
              </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                onClick={() => window.print()}
                title="Export PDF"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export PDF
              </button>
              <button
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                onClick={() => navigator.clipboard.writeText(window.location.href)}
                title="Share"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                Share
              </button>
              <button
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                title="Add to DealFlow"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add to DealFlow
              </button>
              <button
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                title="Edit"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
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

        {/* Disqualifier alert */}
        {isDisqualified && disqualifierReason && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300 text-sm">
            <span className="font-semibold">⚠ Disqualifier: </span>
            {disqualifierReason}
          </div>
        )}

        {/* Executive Summary */}
        <section>
          <h2 className="text-xs font-semibold text-slate-200 mb-3 uppercase tracking-wider">
            Executive Summary
          </h2>
          <p className="text-slate-300 leading-relaxed text-sm">
            {analysis.executiveSummary}
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* INVESTMENT SNAPSHOT — composite score + dimension overview        */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
            Investment Snapshot
          </h2>

          {isIPTech && ipDimensionScores ? (
            /* IP / Technology Track — 9 scored dimensions */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {IP_SNAPSHOT_KEYS.map((key) => {
                const score = ipDimensionScores[key];
                if (score === null) return null;
                return (
                  <div
                    key={key}
                    className={`rounded-xl border p-3 text-center ${scoreBg(score)}`}
                  >
                    <div className={`text-2xl font-bold font-mono ${scoreColor(score)}`}>
                      {score}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                      {IP_DIMENSION_LABELS[key]}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Traditional PE Track — 7 sections */
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {DIMENSIONS.map((dim) => (
                <div
                  key={dim}
                  className={`rounded-xl border p-3 text-center ${scoreBg(dimensionScores[dim])}`}
                >
                  <div
                    className={`text-2xl font-bold font-mono ${scoreColor(dimensionScores[dim])}`}
                  >
                    {dimensionScores[dim]}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                    {DIMENSION_LABELS[dim]}
                  </div>
                </div>
              ))}
            </div>
          )}
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
              <h3 className="text-sm font-semibold text-slate-300 mb-2">
                Score Radar
              </h3>
              <ScoreRadarChart data={radarData} />
            </div>

            {/* Dimension Score Cards */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-slate-300">
                Dimension Scores
                <span className="text-xs font-normal text-slate-500 ml-2">
                  (lowest first)
                </span>
              </h3>

              {isIPTech && ipDimensionScores ? (
                /* IP track — show IP-specific dimension cards */
                IP_SNAPSHOT_KEYS
                  .filter((k) => ipDimensionScores[k] !== null)
                  .sort((a, b) => (ipDimensionScores[a] ?? 0) - (ipDimensionScores[b] ?? 0))
                  .map((key) => {
                    // Map snapshot key to the underlying ISTSection for the card
                    const sectionMap: Record<IPSnapshotKey, ISTSection | undefined> = {
                      technologyReadiness: analysis.technologyReadiness,
                      ipStrengthDefensibility: analysis.ipStrengthDefensibility,
                      marketOpportunity: analysis.marketOpportunity,
                      commercializationPathway: analysis.commercializationPathway,
                      orthogonalApplicationPotential: analysis.orthogonalApplicationPotential,
                      valueCreationPotential: analysis.investmentThesis,
                      riskProfile: analysis.riskAssessment,
                      managementTeam: analysis.managementTeam,
                      strategicFit: analysis.companyOverview,
                    };
                    const section = sectionMap[key];
                    if (!section) return null;
                    return (
                      <DimensionCard
                        key={key}
                        label={IP_DIMENSION_LABELS[key]}
                        section={section}
                      />
                    );
                  })
              ) : (
                /* PE track — existing 7 sections, sorted lowest-first */
                sortedDimensions.map((dim) => (
                  <DimensionCard
                    key={dim}
                    label={DIMENSION_LABELS[dim]}
                    section={analysis[dim]}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* STRENGTHS — sections scoring 7–10                                 */}
        {/* ---------------------------------------------------------------- */}
        {(() => {
          if (isIPTech && ipDimensionScores) {
            // IP track — highlight top IP dimensions
            const strongKeys = IP_SNAPSHOT_KEYS.filter(
              (k) => (ipDimensionScores[k] ?? 0) >= 7
            );
            if (strongKeys.length === 0) return null;
            const sectionMap: Record<IPSnapshotKey, ISTSection | undefined> = {
              technologyReadiness: analysis.technologyReadiness,
              ipStrengthDefensibility: analysis.ipStrengthDefensibility,
              marketOpportunity: analysis.marketOpportunity,
              commercializationPathway: analysis.commercializationPathway,
              orthogonalApplicationPotential: analysis.orthogonalApplicationPotential,
              valueCreationPotential: analysis.investmentThesis,
              riskProfile: analysis.riskAssessment,
              managementTeam: analysis.managementTeam,
              strategicFit: analysis.companyOverview,
            };
            return (
              <section>
                <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
                  Strengths
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {strongKeys.map((key) => {
                    const section = sectionMap[key];
                    if (!section) return null;
                    return (
                      <SectionCommentaryCard
                        key={key}
                        label={IP_DIMENSION_LABELS[key]}
                        section={section}
                      />
                    );
                  })}
                </div>
              </section>
            );
          }
          // PE track
          const strong = DIMENSIONS.filter((d) => dimensionScores[d] >= 7);
          if (strong.length === 0) return null;
          return (
            <section>
              <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
                Strengths
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {strong.map((dim) => (
                  <SectionCommentaryCard
                    key={dim}
                    label={DIMENSION_LABELS[dim]}
                    section={analysis[dim]}
                  />
                ))}
              </div>
            </section>
          );
        })()}

        {/* ---------------------------------------------------------------- */}
        {/* IP / TECHNOLOGY TRACK — specialised sections (PRD §3.4)           */}
        {/* These replace the PE-specific Value Creation / Deal Dynamics panes */}
        {/* ---------------------------------------------------------------- */}
        {isIPTech && (
          <>
            {/* TRL Gauge */}
            {analysis.technologyReadiness && (
              <section>
                <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
                  Technology Assessment
                </h2>
                <TRLGauge section={analysis.technologyReadiness} />
              </section>
            )}

            {/* IP Strength & Defensibility */}
            {analysis.ipStrengthDefensibility && (
              <section>
                <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
                  IP Strength &amp; Defensibility
                </h2>
                <IPStrengthCard section={analysis.ipStrengthDefensibility} />
              </section>
            )}

            {/* Commercialization Pathway */}
            {analysis.commercializationPathway && (
              <section>
                <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
                  Commercialization Pathway
                </h2>
                <CommercializationTimeline section={analysis.commercializationPathway} />
              </section>
            )}

            {/* Orthogonal Applications */}
            {analysis.orthogonalApplicationPotential && (
              <OrthogonalApplicationsSection
                section={analysis.orthogonalApplicationPotential}
              />
            )}
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* RISK TABLE — riskAssessment + any sections scoring ≤ 6            */}
        {/* ---------------------------------------------------------------- */}
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
                      Dimension
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Score
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Key Findings
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(isIPTech
                    ? /* IP track — risk table built from IP dimensions ≤ 6 */
                      (() => {
                        const sectionMap: Partial<Record<IPSnapshotKey, ISTSection>> = {
                          technologyReadiness: analysis.technologyReadiness,
                          ipStrengthDefensibility: analysis.ipStrengthDefensibility,
                          marketOpportunity: analysis.marketOpportunity,
                          commercializationPathway: analysis.commercializationPathway,
                          orthogonalApplicationPotential: analysis.orthogonalApplicationPotential,
                          valueCreationPotential: analysis.investmentThesis,
                          riskProfile: analysis.riskAssessment,
                          managementTeam: analysis.managementTeam,
                          strategicFit: analysis.companyOverview,
                        };
                        return [
                          // riskProfile always first
                          analysis.riskAssessment,
                          // other IP dims ≤ 6, sorted by score
                          ...IP_SNAPSHOT_KEYS.filter(
                            (k) =>
                              k !== "riskProfile" &&
                              (ipDimensionScores?.[k] ?? 11) <= 6
                          )
                            .sort(
                              (a, b) =>
                                (ipDimensionScores?.[a] ?? 0) -
                                (ipDimensionScores?.[b] ?? 0)
                            )
                            .map((k) => sectionMap[k])
                            .filter((s): s is ISTSection => s !== undefined),
                        ];
                      })()
                    : /* PE track — original logic */
                      [
                        analysis.riskAssessment,
                        ...DIMENSIONS.filter(
                          (d) => d !== "riskAssessment" && dimensionScores[d] <= 6
                        )
                          .sort((a, b) => dimensionScores[a] - dimensionScores[b])
                          .map((d) => analysis[d]),
                      ]
                  ).map((section, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-700/60 last:border-0"
                    >
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <span className="font-medium text-slate-200 text-sm">
                          {section.sectionName}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <span
                          className={`text-sm font-bold font-mono ${scoreColor(section.score)}`}
                        >
                          {section.score}/10
                        </span>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {scoreBand(section.score)}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <p className="text-slate-300 text-xs leading-relaxed mb-1">
                          {section.commentary}
                        </p>
                        {section.keyFindings.length > 0 && (
                          <ul className="space-y-0.5">
                            {section.keyFindings.map((f, j) => (
                              <li
                                key={j}
                                className="flex gap-2 text-slate-400 text-xs"
                              >
                                <span className="text-slate-600 shrink-0">•</span>
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* VALUE CREATION — investmentThesis detail (PE track only)          */}
        {/* For IP track this information is covered by CommercializationTimeline */}
        {/* ---------------------------------------------------------------- */}
        {!isIPTech && (
          <section>
            <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
              Value Creation
            </h2>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-slate-100 text-sm">
                  Investment Thesis
                </h3>
                <span
                  className={`text-sm font-bold font-mono px-2 py-0.5 rounded-full border ${scoreBg(analysis.investmentThesis.score)} ${scoreColor(analysis.investmentThesis.score)}`}
                >
                  {analysis.investmentThesis.score}/10
                </span>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-3">
                {analysis.investmentThesis.commentary}
              </p>
              {analysis.investmentThesis.keyFindings.length > 0 && (
                <ul className="space-y-1.5">
                  {analysis.investmentThesis.keyFindings.map((f, i) => (
                    <li key={i} className="flex gap-2 text-slate-300 text-sm">
                      <span className="text-indigo-400 shrink-0 mt-0.5">→</span>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* KEY QUESTIONS / DEAL DYNAMICS — PE track only                     */}
        {/* Valuation multiple and transaction feasibility are PE-specific.   */}
        {/* ---------------------------------------------------------------- */}
        {!isIPTech && (
          <section>
            <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
              Key Questions / Deal Dynamics
            </h2>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-slate-100 text-sm">
                  Deal Dynamics
                </h3>
                <span
                  className={`text-sm font-bold font-mono px-2 py-0.5 rounded-full border ${scoreBg(analysis.dealDynamics.score)} ${scoreColor(analysis.dealDynamics.score)}`}
                >
                  {analysis.dealDynamics.score}/10
                </span>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-3">
                {analysis.dealDynamics.commentary}
              </p>
              {analysis.dealDynamics.keyFindings.length > 0 && (
                <ul className="space-y-2">
                  {analysis.dealDynamics.keyFindings.map((q, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <div className="mt-1.5 w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                      <p className="text-slate-300 text-sm">{q}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* COLLAPSIBLE RAW DOCUMENT                                          */}
        {/* ---------------------------------------------------------------- */}
        {rawDocumentText && (
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              Raw Document
            </button>
            {rawExpanded && (
              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-5 overflow-x-auto">
                <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
                  {rawDocumentText}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
          <span>Screening ID: {screeningId}</span>
          <span>Analysis Date: {analysis.analysisDate}</span>
          <span>
            Overall Score:{" "}
            <span className={compositeColor(compositeScore)}>
              {compositeScore.toFixed(1)} / 10
            </span>
          </span>
        </div>
      </main>
    </div>
  );
}
