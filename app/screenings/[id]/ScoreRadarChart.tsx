"use client";

/**
 * ScoreRadarChart — recharts-based radar chart for IST dimension scores.
 *
 * Extracted into its own file so it can be lazy-loaded with React.lazy,
 * keeping recharts out of the initial JS bundle for the results page.
 */

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
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

export default function ScoreRadarChart({
  data,
  recommendation,
}: {
  data: RadarDataPoint[];
  recommendation: FinalRecommendation;
}) {
  const fillColor = RECOMMENDATION_COLORS[recommendation];

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
