"use client";

/**
 * UsageDashboardClient — API Usage Dashboard
 *
 * Displays:
 * - KPI cards: total screenings this month, total API cost, avg cost per
 *   screening, avg latency
 * - Rate-limit indicator: today's calls vs. 50-per-day limit (PRD §2.4)
 * - Daily usage bar chart for the past 30 days (Recharts)
 * - Table of the 10 most expensive screenings this month
 *
 * PRD §6.2.5 — Settings / Admin Page: API usage dashboard
 * PRD §2.4   — Rate limiting: max 50 screenings per day
 * PRD §6.1   — Dark theme: navy/slate backgrounds, indigo accents,
 *               font-mono for financial figures and scores
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageSummary {
  /** Distinct screenings that triggered at least one successful API call this month. */
  screeningsThisMonth: number;
  /** Sum of cost_estimate for successful calls this month (USD). */
  totalCostThisMonth: number;
  /** Average cost per screening this month (USD). */
  avgCostPerScreening: number;
  /** Average latency across all successful calls this month (ms). */
  avgLatencyMs: number;
  /** Number of successful API calls today (for rate-limit indicator). */
  todayCount: number;
  /** Configured daily limit (50 per PRD §2.4). */
  dailyLimit: number;
}

export interface DailyUsage {
  /** YYYY-MM-DD */
  date: string;
  /** Number of successful API calls on this day. */
  calls: number;
  /** Total cost_estimate for this day (USD). */
  cost: number;
}

export interface ExpensiveScreening {
  id: string;
  companyName: string;
  /** ISO timestamp of first API call for this screening. */
  date: string;
  /** Total cost across all API calls for this screening (USD). */
  totalCost: number;
  /** Number of API calls for this screening. */
  calls: number;
}

interface UsageDashboardClientProps {
  summary: UsageSummary;
  dailyUsage: DailyUsage[];
  expensiveScreenings: ExpensiveScreening[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatUsd(value: number): string {
  if (value < 0.01 && value > 0) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/** Short month/day label for the chart X axis, e.g. "Apr 1". */
function shortDateLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

function formatDateDisplay(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
}

function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="font-mono text-2xl font-semibold text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip for the bar chart
// ---------------------------------------------------------------------------

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const calls = payload[0]?.value ?? 0;
  const cost = payload[1]?.value ?? 0;
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-sm shadow-lg">
      <p className="mb-1 font-medium text-slate-200">{label}</p>
      <p className="text-slate-400">
        API calls:{" "}
        <span className="font-mono font-medium text-indigo-300">{calls}</span>
      </p>
      <p className="text-slate-400">
        Cost:{" "}
        <span className="font-mono font-medium text-emerald-300">{formatUsd(cost)}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rate-limit indicator
// ---------------------------------------------------------------------------

interface RateLimitProps {
  todayCount: number;
  dailyLimit: number;
}

function RateLimitIndicator({ todayCount, dailyLimit }: RateLimitProps) {
  const pct = Math.min((todayCount / dailyLimit) * 100, 100);
  const remaining = Math.max(dailyLimit - todayCount, 0);

  let barColor = "bg-emerald-500";
  let textColor = "text-emerald-400";
  let statusLabel = "Healthy";

  if (pct >= 100) {
    barColor = "bg-red-500";
    textColor = "text-red-400";
    statusLabel = "Limit Reached";
  } else if (pct >= 80) {
    barColor = "bg-amber-500";
    textColor = "text-amber-400";
    statusLabel = "Near Limit";
  }

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Today&apos;s Rate Limit
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
            pct >= 100
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : pct >= 80
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-baseline justify-between">
        <p className={`font-mono text-xl font-semibold ${textColor}`}>
          {todayCount}{" "}
          <span className="text-sm font-normal text-slate-500">/ {dailyLimit}</span>
        </p>
        <p className="text-xs text-slate-500">
          {remaining} remaining today
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-600">Resets at midnight UTC</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function UsageDashboardClient({
  summary,
  dailyUsage,
  expensiveScreenings,
}: UsageDashboardClientProps) {
  // Thin every-other label on the X axis when there are 30 bars
  const xAxisTicks = dailyUsage
    .filter((_, i) => i % 5 === 0 || i === dailyUsage.length - 1)
    .map((d) => d.date);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-200 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">

        {/* ------------------------------------------------------------------ */}
        {/* Header                                                              */}
        {/* ------------------------------------------------------------------ */}
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">API Usage Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Claude API cost tracking and screening volume — current month
          </p>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* KPI cards + rate-limit indicator                                    */}
        {/* ------------------------------------------------------------------ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Screenings This Month"
            value={summary.screeningsThisMonth.toString()}
            sub="Distinct screening sessions"
          />
          <KpiCard
            label="Total API Cost This Month"
            value={formatUsd(summary.totalCostThisMonth)}
            sub="Sum of cost_estimate (Claude API)"
          />
          <KpiCard
            label="Avg Cost per Screening"
            value={formatUsd(summary.avgCostPerScreening)}
            sub={
              summary.screeningsThisMonth > 0
                ? `Across ${summary.screeningsThisMonth} screenings`
                : "No screenings yet"
            }
          />
          <KpiCard
            label="Avg API Latency"
            value={summary.avgLatencyMs > 0 ? formatMs(summary.avgLatencyMs) : "—"}
            sub="Average response time (successful calls)"
          />
          {/* Rate-limit indicator spans 2 columns on lg+ */}
          <div className="sm:col-span-2 lg:col-span-2">
            <RateLimitIndicator
              todayCount={summary.todayCount}
              dailyLimit={summary.dailyLimit}
            />
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Daily usage bar chart — past 30 days                               */}
        {/* ------------------------------------------------------------------ */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-100">
            Daily API Calls — Past 30 Days
          </h2>
          <p className="mb-6 text-xs text-slate-500">Successful calls per day (errors excluded)</p>

          {dailyUsage.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No usage data available.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyUsage}
                  margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#334155" }}
                    ticks={xAxisTicks}
                    tickFormatter={shortDateLabel}
                  />
                  <YAxis
                    yAxisId="calls"
                    orientation="left"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={32}
                  />
                  <YAxis
                    yAxisId="cost"
                    orientation="right"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    width={56}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                  <Bar
                    yAxisId="calls"
                    dataKey="calls"
                    name="API Calls"
                    fill="#6366f1"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    yAxisId="cost"
                    dataKey="cost"
                    name="Cost (USD)"
                    fill="#10b981"
                    radius={[3, 3, 0, 0]}
                    opacity={0.7}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex items-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-500" />
              API Calls (left axis)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500 opacity-70" />
              Cost USD (right axis)
            </span>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Top 10 most expensive screenings                                   */}
        {/* ------------------------------------------------------------------ */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-100">
            Top 10 Most Expensive Screenings
          </h2>
          <p className="mb-6 text-xs text-slate-500">
            Current month — ranked by total API cost per screening session
          </p>

          {expensiveScreenings.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              No screening data available for this month.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60">
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      #
                    </th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Company
                    </th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Date
                    </th>
                    <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      API Calls
                    </th>
                    <th className="pb-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      Total Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {expensiveScreenings.map((s, idx) => (
                    <tr
                      key={s.id}
                      className="group transition-colors hover:bg-slate-700/30"
                    >
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs text-slate-500">{idx + 1}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <a
                          href={`/screenings/${s.id}`}
                          className="font-medium text-slate-100 transition-colors group-hover:text-indigo-300"
                        >
                          {s.companyName}
                        </a>
                      </td>
                      <td className="py-3 pr-4 text-slate-400">
                        {formatDateDisplay(s.date)}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="font-mono text-slate-300">{s.calls}</span>
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`font-mono font-semibold ${
                            s.totalCost >= 0.5
                              ? "text-red-400"
                              : s.totalCost >= 0.1
                                ? "text-amber-400"
                                : "text-emerald-400"
                          }`}
                        >
                          {formatUsd(s.totalCost)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-600">
          Data sourced from <code className="font-mono">api_usage_log</code>. Failed API calls (
          <code className="font-mono">error_message IS NOT NULL</code>) are excluded from cost and
          latency calculations. Daily limit enforced by the{" "}
          <code className="font-mono">analyze-deal</code> edge function (PRD §2.4).
        </p>
      </div>
    </div>
  );
}
