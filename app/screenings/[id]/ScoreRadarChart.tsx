"use client";

/**
 * ScoreRadarChart — recharts-based radar chart for IST dimension scores.
 *
 * Extracted into its own file so it can be lazy-loaded with React.lazy,
 * keeping recharts out of the initial JS bundle for the results page.
 *
 * On mobile viewports (compact=true) renders a horizontal bar chart instead
 * of the radar chart so all dimension labels remain readable on 390px screens.
 */

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { FinalRecommendation } from "@/lib/scoringEngine";

export interface RadarDataPoint {
  subject: string;
  value: number;
  fullMark: number;
  justification?: string;
}

const RECOMMENDATION_COLORS: Record<FinalRecommendation, string> = {
  PROCEED: "#22C55E",
  FURTHER_REVIEW: "#F59E0B",
  PASS: "#EF4444",
};

function RadarTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as RadarDataPoint | undefined;
  if (!point) return null;
  const justification = point.justification;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 max-w-[260px]">
      <p className="font-mono font-bold text-xs text-slate-100 mb-1">
        {point.subject}
      </p>
      <p
        className={`font-mono text-xs text-slate-400 ${justification ? "mb-2" : "mb-0"}`}
      >
        Score:{" "}
        <span className="font-bold text-slate-100">{point.value} / 10</span>
      </p>
      {justification && (
        <p className="font-mono text-[11px] leading-relaxed text-slate-400 m-0">
          {justification}
        </p>
      )}
    </div>
  );
}

/** Height per bar (px) in the compact horizontal bar chart. */
const BAR_HEIGHT = 36;
/** Top + bottom margin (px) for the compact chart container. */
const CHART_MARGIN = 20;

function scoreBarColor(score: number): string {
  if (score >= 7) return "#22c55e"; // emerald-500
  if (score >= 5) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
}

/** Horizontal bar chart variant rendered on mobile viewports. */
function ScoreBarChart({
  data,
}: {
  data: RadarDataPoint[];
}) {
  return (
    <ResponsiveContainer width="100%" height={data.length * BAR_HEIGHT + CHART_MARGIN}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
      >
        <XAxis
          type="number"
          domain={[0, 10]}
          tickCount={6}
          tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="subject"
          width={130}
          tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(99,102,241,0.08)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as RadarDataPoint | undefined;
            if (!point) return null;
            return (
              <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 max-w-[220px]">
                <p className="font-mono font-bold text-xs text-slate-100 mb-1">{point.subject}</p>
                <p className="font-mono text-xs text-slate-400">
                  Score: <span className="font-bold text-slate-100">{point.value} / 10</span>
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={scoreBarColor(entry.value)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ScoreRadarChart({
  data,
  recommendation,
  compact = false,
}: {
  data: RadarDataPoint[];
  recommendation: FinalRecommendation;
  compact?: boolean;
}) {
  const fillColor = RECOMMENDATION_COLORS[recommendation];

  if (compact) {
    return <ScoreBarChart data={data} />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
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
        <Radar
          name="Score"
          dataKey="value"
          stroke={fillColor}
          fill={fillColor}
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip content={<RadarTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
