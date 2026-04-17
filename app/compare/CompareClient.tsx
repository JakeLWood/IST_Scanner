"use client";

/**
 * CompareClient — interactive deal comparison UI
 * PRD §6.2.4 — Deal Comparison Page
 *
 * Allows selecting 2–4 screened deals and viewing them side-by-side:
 *  • Overlaid radar chart (one colored line per deal)
 *  • Side-by-side financial metrics table with winner highlighting
 *  • Composite score comparison bar chart
 *  • Dimension-by-dimension score table with winner highlighted
 */

import { useState, useMemo, useRef, useEffect } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompareRow {
  id: string;
  companyName: string;
  dealType: string | null;
  compositeScore: number | null;
  recommendation: "PROCEED" | "FURTHER_REVIEW" | "PASS" | null;
  // Financial metrics from snapshot_json (may be null if not available)
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  revenueGrowthRate: number | null;
  evEbitdaMultiple: number | null;
  // Dimension scores from scores_json (7 standard PE dimensions)
  dimensionScores: Partial<Record<string, number | null>>;
}

interface CompareClientProps {
  rows: CompareRow[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SELECTED = 4;
const MIN_SELECTED = 2;

/** One distinct color per deal slot (indigo, emerald, amber, pink). */
const DEAL_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899"];

/** The 7 standard PE-track dimension keys in display order. */
const PE_DIMENSIONS: string[] = [
  "companyOverview",
  "marketOpportunity",
  "financialProfile",
  "managementTeam",
  "investmentThesis",
  "riskAssessment",
  "dealDynamics",
];

/** Additional IP/Tech-track dimension keys. */
const IP_DIMENSIONS: string[] = [
  "technologyReadiness",
  "ipStrengthDefensibility",
  "commercializationPathway",
  "orthogonalApplicationPotential",
];

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 7) return "text-emerald-400";
  if (score >= 5) return "text-amber-400";
  return "text-red-400";
}

function scoreBgClass(score: number): string {
  if (score >= 7)
    return "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300";
  if (score >= 5)
    return "bg-amber-500/20 border border-amber-500/40 text-amber-300";
  return "bg-red-500/20 border border-red-500/40 text-red-300";
}

function compositeColorClass(score: number): string {
  if (score >= 7.5) return "text-emerald-400";
  if (score >= 5.5) return "text-amber-400";
  return "text-red-400";
}

function verdictBadge(rec: "PROCEED" | "FURTHER_REVIEW" | "PASS"): {
  label: string;
  classes: string;
} {
  switch (rec) {
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

function dealTypeLabel(dt: string | null): string {
  if (!dt) return "—";
  const map: Record<string, string> = {
    traditional_pe: "Traditional PE",
    ip_technology: "IP / Technology",
    growth_equity: "Growth Equity",
    venture: "Venture",
  };
  return map[dt] ?? dt;
}

function formatCurrency(val: number | null): string {
  if (val === null) return "—";
  if (Math.abs(val) >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(val) >= 1_000) {
    return `$${(val / 1_000).toFixed(0)}K`;
  }
  return `$${val.toLocaleString()}`;
}

function formatPercent(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(1)}%`;
}

function formatMultiple(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(1)}x`;
}

// ---------------------------------------------------------------------------
// Financial metrics definition
// ---------------------------------------------------------------------------

interface MetricDef {
  key: keyof Pick<
    CompareRow,
    "revenue" | "ebitda" | "ebitdaMargin" | "revenueGrowthRate" | "evEbitdaMultiple"
  >;
  label: string;
  format: (v: number | null) => string;
  /** true = higher is better, false = lower is better */
  higherIsBetter: boolean;
}

const FINANCIAL_METRICS: MetricDef[] = [
  {
    key: "revenue",
    label: "Revenue",
    format: formatCurrency,
    higherIsBetter: true,
  },
  {
    key: "ebitda",
    label: "EBITDA",
    format: formatCurrency,
    higherIsBetter: true,
  },
  {
    key: "ebitdaMargin",
    label: "EBITDA Margin",
    format: formatPercent,
    higherIsBetter: true,
  },
  {
    key: "revenueGrowthRate",
    label: "Revenue Growth",
    format: formatPercent,
    higherIsBetter: true,
  },
  {
    key: "evEbitdaMultiple",
    label: "EV / EBITDA",
    format: formatMultiple,
    higherIsBetter: false,
  },
];

/**
 * Returns the index of the winning deal for a given metric.
 * Returns -1 if all values are null or there is a tie.
 */
function findWinner(
  deals: CompareRow[],
  metricKey: MetricDef["key"],
  higherIsBetter: boolean,
): number {
  const values = deals.map((d) => d[metricKey]);
  const nonNull = values.filter((v): v is number => v !== null);
  if (nonNull.length === 0) return -1;

  const best = higherIsBetter ? Math.max(...nonNull) : Math.min(...nonNull);
  const tieCount = values.filter((v) => v === best).length;
  if (tieCount > 1) return -1;
  return values.findIndex((v) => v === best);
}

/**
 * Returns the index of the winning deal for a given dimension score.
 * Returns -1 if all values are null or there is a tie.
 */
function findDimensionWinner(deals: CompareRow[], dim: string): number {
  const values = deals.map((d) => {
    const s = d.dimensionScores[dim];
    return s !== undefined ? s : null;
  });
  const nonNull = values.filter((v): v is number => v !== null);
  if (nonNull.length === 0) return -1;
  const best = Math.max(...nonNull);
  const tieCount = values.filter((v) => v === best).length;
  if (tieCount > 1) return -1;
  return values.findIndex((v) => v === best);
}

// ---------------------------------------------------------------------------
// Radar chart helpers
// ---------------------------------------------------------------------------

type RadarPoint = Record<string, string | number>;

function buildRadarData(deals: CompareRow[], dimensions: string[]): RadarPoint[] {
  return dimensions.map((dim) => {
    const point: RadarPoint = { subject: DIMENSION_LABELS[dim] ?? dim };
    for (const deal of deals) {
      const score = deal.dimensionScores[dim];
      // Only include numeric scores — null/undefined are omitted so recharts
      // renders a gap rather than a misleading zero.
      if (score !== null && score !== undefined) {
        point[deal.id] = score;
      }
    }
    return point;
  });
}

// ---------------------------------------------------------------------------
// Overlaid radar chart
// ---------------------------------------------------------------------------

function OverlaidRadarChart({ deals }: { deals: CompareRow[] }) {
  const hasIPDims = deals.some((d) =>
    IP_DIMENSIONS.some(
      (k) =>
        d.dimensionScores[k] !== undefined && d.dimensionScores[k] !== null,
    ),
  );
  const allDimensions = hasIPDims
    ? [...PE_DIMENSIONS, ...IP_DIMENSIONS]
    : PE_DIMENSIONS;

  // Only render dimensions where every selected deal has a score,
  // so the radar lines are never pulled toward zero by missing values.
  const dimensions = allDimensions.filter((dim) =>
    deals.every((d) => {
      const s = d.dimensionScores[dim];
      return s !== null && s !== undefined;
    }),
  );

  const radarData = buildRadarData(deals, dimensions);

  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart
        data={radarData}
        margin={{ top: 20, right: 48, bottom: 20, left: 48 }}
      >
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{
            fill: "#94a3b8",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
          }}
        />
        <PolarRadiusAxis
          domain={[0, 10]}
          tickCount={6}
          tick={{
            fill: "#64748b",
            fontSize: 9,
            fontFamily: "JetBrains Mono, monospace",
          }}
          axisLine={false}
        />
        {deals.map((deal, i) => (
          <Radar
            key={deal.id}
            name={deal.companyName}
            dataKey={deal.id}
            stroke={DEAL_COLORS[i % DEAL_COLORS.length]}
            fill={DEAL_COLORS[i % DEAL_COLORS.length]}
            fillOpacity={0.12}
            strokeWidth={2}
            dot={{ r: 3, fill: DEAL_COLORS[i % DEAL_COLORS.length] }}
          />
        ))}
        <Legend
          wrapperStyle={{
            fontSize: "11px",
            fontFamily: "JetBrains Mono, monospace",
            color: "#94a3b8",
            paddingTop: "8px",
          }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 min-w-[160px]">
                <p className="text-xs font-semibold text-slate-300 mb-2">
                  Dimension Scores
                </p>
                {payload.map((entry, idx) => {
                  const entryName = entry.name as string;
                  const deal = deals.find((d) => d.id === entryName);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 mb-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: entry.color as string }}
                        />
                        <span className="text-xs text-slate-400 truncate max-w-[100px]">
                          {deal?.companyName ?? entryName}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-100">
                        {entry.value as number}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Composite score bar chart
// ---------------------------------------------------------------------------

function CompositeScoreBarChart({ deals }: { deals: CompareRow[] }) {
  const data = deals.map((deal) => ({
    name:
      deal.companyName.length > 20
        ? deal.companyName.slice(0, 20) + "…"
        : deal.companyName,
    score: deal.compositeScore ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, deals.length * 52)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#334155"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[0, 10]}
          tickCount={6}
          tick={{
            fill: "#64748b",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
          }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{
            fill: "#94a3b8",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
          }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(99,102,241,0.08)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const val = payload[0]?.value as number;
            const payloadData = payload[0]?.payload as { name: string };
            const idx = data.findIndex((d) => d.name === payloadData?.name);
            return (
              <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
                <p className="text-xs font-mono font-bold text-slate-100">
                  {val.toFixed(1)} / 10
                </p>
                <p className="text-xs text-slate-400">
                  {idx >= 0 ? deals[idx]?.companyName : ""}
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={32}>
          {data.map((_, index) => (
            <Cell key={index} fill={DEAL_COLORS[index % DEAL_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Financial metrics table
// ---------------------------------------------------------------------------

function FinancialMetricsTable({ deals }: { deals: CompareRow[] }) {
  const hasAnyFinancial = FINANCIAL_METRICS.some((m) =>
    deals.some((d) => d[m.key] !== null),
  );

  if (!hasAnyFinancial) {
    return (
      <p className="text-sm text-slate-500 italic">
        Financial snapshot data is not available for the selected deals. Financial
        metrics are populated when a deal document includes structured financial data
        extracted during screening.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left text-xs font-semibold text-slate-400 pb-3 pr-4 w-36">
              Metric
            </th>
            {deals.map((deal, i) => (
              <th
                key={deal.id}
                className="text-center text-xs font-semibold pb-3 px-2"
              >
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: DEAL_COLORS[i % DEAL_COLORS.length],
                    }}
                  />
                  <span className="text-slate-300 leading-tight line-clamp-2 max-w-[120px]">
                    {deal.companyName}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/40">
          {FINANCIAL_METRICS.map((metric) => {
            const winnerIdx = findWinner(deals, metric.key, metric.higherIsBetter);
            return (
              <tr key={metric.key}>
                <td className="py-2.5 pr-4 text-xs font-medium text-slate-400 whitespace-nowrap">
                  {metric.label}
                  {!metric.higherIsBetter && (
                    <span className="ml-1 text-slate-600">(lower = better)</span>
                  )}
                </td>
                {deals.map((deal, i) => {
                  const val = deal[metric.key];
                  const isWinner = winnerIdx === i;
                  return (
                    <td
                      key={deal.id}
                      className={`py-2.5 px-2 text-center rounded text-xs font-mono font-semibold transition-colors ${
                        isWinner && val !== null
                          ? "text-emerald-300 bg-emerald-500/10"
                          : val === null
                            ? "text-slate-600"
                            : "text-slate-300"
                      }`}
                    >
                      {metric.format(val)}
                      {isWinner && val !== null && (
                        <span className="ml-1 text-emerald-400">↑</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dimension score table
// ---------------------------------------------------------------------------

function DimensionScoreTable({ deals }: { deals: CompareRow[] }) {
  const hasIPDims = deals.some((d) =>
    IP_DIMENSIONS.some(
      (k) =>
        d.dimensionScores[k] !== undefined && d.dimensionScores[k] !== null,
    ),
  );
  const dimensions = hasIPDims
    ? [...PE_DIMENSIONS, ...IP_DIMENSIONS]
    : PE_DIMENSIONS;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left text-xs font-semibold text-slate-400 pb-3 pr-4 w-52">
              Dimension
            </th>
            {deals.map((deal, i) => (
              <th
                key={deal.id}
                className="text-center text-xs font-semibold pb-3 px-3"
              >
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: DEAL_COLORS[i % DEAL_COLORS.length],
                    }}
                  />
                  <span className="text-slate-300 leading-tight line-clamp-2 max-w-[120px]">
                    {deal.companyName}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/40">
          {dimensions.map((dim) => {
            const winnerIdx = findDimensionWinner(deals, dim);
            const anyHasScore = deals.some((d) => {
              const s = d.dimensionScores[dim];
              return s !== null && s !== undefined;
            });
            if (!anyHasScore) return null;

            return (
              <tr key={dim}>
                <td className="py-2.5 pr-4 text-xs font-medium text-slate-400 whitespace-nowrap">
                  {DIMENSION_LABELS[dim] ?? dim}
                </td>
                {deals.map((deal, i) => {
                  const score = deal.dimensionScores[dim];
                  const isWinner = winnerIdx === i;
                  const hasScore = score !== null && score !== undefined;
                  return (
                    <td key={deal.id} className="py-2.5 px-3 text-center">
                      {hasScore ? (
                        <span
                          className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-mono font-bold ${scoreBgClass(score as number)} ${
                            isWinner
                              ? "outline outline-1 outline-offset-1"
                              : ""
                          }`}
                          style={
                            isWinner
                              ? {
                                  outlineColor:
                                    DEAL_COLORS[i % DEAL_COLORS.length],
                                }
                              : {}
                          }
                        >
                          {score}
                          {isWinner && (
                            <span
                              className={`ml-1 ${scoreColor(score as number)}`}
                            >
                              ★
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-600">
            <td className="pt-3 pb-1 pr-4 text-xs font-semibold text-slate-200">
              Composite Score
            </td>
            {deals.map((deal, i) => (
              <td key={deal.id} className="pt-3 pb-1 px-3 text-center">
                <span
                  className={`text-base font-mono font-bold ${
                    deal.compositeScore !== null
                      ? compositeColorClass(deal.compositeScore)
                      : "text-slate-600"
                  }`}
                >
                  {deal.compositeScore !== null
                    ? deal.compositeScore.toFixed(1)
                    : "—"}
                </span>
                {deal.recommendation && (
                  <div className="mt-1">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        verdictBadge(deal.recommendation).classes
                      }`}
                    >
                      {verdictBadge(deal.recommendation).label}
                    </span>
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: DEAL_COLORS[i % DEAL_COLORS.length],
                    }}
                  />
                  <span className="text-[10px] text-slate-500 truncate max-w-[90px]">
                    {deal.companyName}
                  </span>
                </div>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deal selector (searchable multi-select dropdown)
// ---------------------------------------------------------------------------

function DealSelector({
  rows,
  selectedIds,
  onToggle,
}: {
  rows: CompareRow[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => r.companyName.toLowerCase().includes(q));
  }, [rows, query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Build ordered list of selected deals (in insertion order via selectedIds iteration)
  const selectedDeals = useMemo(() => {
    const result: CompareRow[] = [];
    for (const id of selectedIds) {
      const found = rows.find((r) => r.id === id);
      if (found) result.push(found);
    }
    return result;
  }, [selectedIds, rows]);

  const canAddMore = selectedIds.size < MAX_SELECTED;

  return (
    <div className="space-y-3">
      {/* Selected deal tags */}
      {selectedDeals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedDeals.map((deal, i) => (
            <div
              key={deal.id}
              className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 pl-2 pr-1 py-1"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: DEAL_COLORS[i % DEAL_COLORS.length] }}
              />
              <span className="text-xs font-medium text-slate-200 max-w-[160px] truncate">
                {deal.companyName}
              </span>
              <button
                className="ml-1 rounded p-0.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                onClick={() => onToggle(deal.id)}
                aria-label={`Remove ${deal.companyName}`}
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search input + dropdown */}
      <div className="relative" ref={containerRef}>
        <div
          className={`flex items-center gap-2 rounded-lg border ${
            open ? "border-indigo-500" : "border-slate-600"
          } bg-slate-800 px-3 py-2 cursor-text`}
          onClick={() => {
            if (canAddMore) setOpen(true);
          }}
        >
          <svg
            className="w-4 h-4 text-slate-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 outline-none min-w-0"
            placeholder={
              canAddMore
                ? `Search deals… (${selectedIds.size}/${MAX_SELECTED} selected)`
                : `Maximum ${MAX_SELECTED} deals selected`
            }
            value={query}
            disabled={!canAddMore}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => canAddMore && setOpen(true)}
          />
          {selectedIds.size > 0 && (
            <span className="text-xs text-slate-500 font-mono shrink-0">
              {selectedIds.size}/{MAX_SELECTED}
            </span>
          )}
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 shadow-xl overflow-hidden">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">
                No deals match your search.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto divide-y divide-slate-700/50">
                {filtered.map((row) => {
                  const isSelected = selectedIds.has(row.id);
                  const selIdx = selectedDeals.findIndex((d) => d.id === row.id);
                  const disabled = !isSelected && !canAddMore;
                  return (
                    <li key={row.id}>
                      <button
                        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${
                          disabled
                            ? "opacity-40 cursor-not-allowed"
                            : isSelected
                              ? "bg-slate-700/60 hover:bg-slate-700"
                              : "hover:bg-slate-700/50"
                        }`}
                        disabled={disabled}
                        onClick={() => {
                          if (!disabled) {
                            onToggle(row.id);
                            setQuery("");
                            if (!isSelected && selectedIds.size + 1 >= MAX_SELECTED) {
                              setOpen(false);
                            }
                          }
                        }}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 border ${
                            isSelected && selIdx !== -1
                              ? "border-transparent"
                              : "border-slate-600 bg-transparent"
                          }`}
                          style={
                            isSelected && selIdx !== -1
                              ? {
                                  backgroundColor:
                                    DEAL_COLORS[selIdx % DEAL_COLORS.length],
                                }
                              : {}
                          }
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-slate-200 truncate">
                            {row.companyName}
                          </span>
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {dealTypeLabel(row.dealType)}
                            {row.compositeScore !== null && (
                              <span
                                className={`ml-2 font-mono ${compositeColorClass(row.compositeScore)}`}
                              >
                                {row.compositeScore.toFixed(1)}/10
                              </span>
                            )}
                          </span>
                        </span>
                        {isSelected && (
                          <svg
                            className="w-4 h-4 text-indigo-400 shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
        {title}
      </h2>
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state (< 2 deals selected)
// ---------------------------------------------------------------------------

function EmptyState({ count }: { count: number }) {
  const needed = MIN_SELECTED - count;
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-800/30 py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
      <p className="text-slate-300 font-medium mb-1">
        {count === 0
          ? "Select 2–4 deals to begin comparing"
          : `Select ${needed} more deal${needed > 1 ? "s" : ""} to compare`}
      </p>
      <p className="text-slate-500 text-sm">
        Use the search above to add screened deals to the comparison view.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CompareClient component
// ---------------------------------------------------------------------------

export default function CompareClient({ rows }: CompareClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function handleToggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECTED) {
        next.add(id);
      }
      return next;
    });
  }

  // Preserve insertion order for consistent deal colours
  const selectedDeals = useMemo(() => {
    const result: CompareRow[] = [];
    for (const id of selectedIds) {
      const deal = rows.find((r) => r.id === id);
      if (deal) result.push(deal);
    }
    return result;
  }, [selectedIds, rows]);

  const canCompare = selectedDeals.length >= MIN_SELECTED;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ------------------------------------------------------------------ */}
      {/* HEADER                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <a
                href="/screenings"
                className="text-slate-400 hover:text-slate-200 transition-colors"
                title="Back to Deal Log"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </a>
              <div>
                <h1 className="text-lg font-bold text-slate-100 leading-tight">
                  Deal Comparison
                </h1>
                <p className="text-xs text-slate-400">
                  Select 2–4 screened deals to compare side-by-side
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href="/"
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
              >
                Home
              </a>
              <a
                href="/upload"
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                Screen a Deal
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN CONTENT                                                         */}
      {/* ------------------------------------------------------------------ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Deal selector */}
        <section>
          <h2 className="text-xs font-semibold text-slate-200 mb-4 uppercase tracking-wider">
            Select Deals to Compare
          </h2>
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">
                No screened deals found.{" "}
                <a
                  href="/upload"
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  Screen a deal
                </a>{" "}
                to get started.
              </p>
            ) : (
              <DealSelector
                rows={rows}
                selectedIds={selectedIds}
                onToggle={handleToggle}
              />
            )}
          </div>
        </section>

        {/* Comparison views */}
        {!canCompare ? (
          <EmptyState count={selectedDeals.length} />
        ) : (
          <div className="space-y-8">
            {/* 1. Overlaid radar chart */}
            <Section title="Dimension Score Radar">
              <div className="mb-2 flex flex-wrap gap-4 justify-center">
                {selectedDeals.map((deal, i) => (
                  <div key={deal.id} className="flex items-center gap-1.5">
                    <span
                      style={{
                        display: "inline-block",
                        width: "16px",
                        height: "3px",
                        backgroundColor: DEAL_COLORS[i % DEAL_COLORS.length],
                        borderRadius: "2px",
                      }}
                    />
                    <span className="text-xs text-slate-400">
                      {deal.companyName}
                    </span>
                  </div>
                ))}
              </div>
              <OverlaidRadarChart deals={selectedDeals} />
            </Section>

            {/* 2. Composite score bar chart */}
            <Section title="Composite Score Comparison">
              <CompositeScoreBarChart deals={selectedDeals} />
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {selectedDeals.map((deal, i) => (
                  <div
                    key={deal.id}
                    className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-center"
                  >
                    <div
                      className={`text-2xl font-bold font-mono ${
                        deal.compositeScore !== null
                          ? compositeColorClass(deal.compositeScore)
                          : "text-slate-600"
                      }`}
                    >
                      {deal.compositeScore !== null
                        ? deal.compositeScore.toFixed(1)
                        : "—"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">/ 10</div>
                    {deal.recommendation && (
                      <div className="mt-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            verdictBadge(deal.recommendation).classes
                          }`}
                        >
                          {verdictBadge(deal.recommendation).label}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: DEAL_COLORS[i % DEAL_COLORS.length],
                        }}
                      />
                      <span className="text-xs text-slate-400 truncate max-w-[90px]">
                        {deal.companyName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 3. Financial metrics table */}
            <Section title="Financial Metrics">
              <FinancialMetricsTable deals={selectedDeals} />
            </Section>

            {/* 4. Dimension-by-dimension score table */}
            <Section title="Dimension-by-Dimension Scores">
              <p className="text-xs text-slate-500 mb-4">
                ★ marks the highest score in each dimension. Scores are on a 1–10
                scale (7+ = strong, 5–6 = adequate, 3–4 = concerning, 1–2 =
                deal-breaking).
              </p>
              <DimensionScoreTable deals={selectedDeals} />
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}
