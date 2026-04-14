"use client";

/**
 * AdminSettingsClient
 *
 * Client-side admin settings panel for dimension weights and thresholds.
 * Features:
 * - Track switcher: Traditional PE vs IP/Technology (one active at a time)
 * - Dimension weight sliders (10 per track) with live sum validation
 * - Preset reset button to restore PRD defaults
 * - PROCEED / FURTHER REVIEW threshold number inputs
 * - Live composite score preview (based on a representative sample deal)
 * - Save button that calls the saveScoringConfig server action
 */

import { useState, useCallback, useMemo } from "react";
import { saveScoringConfig } from "@/lib/actions/saveScoringConfig";

// ---------------------------------------------------------------------------
// PRD §3.5 Default weights
// ---------------------------------------------------------------------------

export interface DimensionConfig {
  /** Stable key used as the `dimension` column value in scoring_config. */
  key: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Default weight as a percentage (0–100). */
  defaultWeight: number;
  /** PRD rationale shown as a tooltip / subtitle. */
  rationale: string;
}

export const PE_DIMENSIONS: DimensionConfig[] = [
  {
    key: "financial_quality",
    label: "Financial Quality",
    defaultWeight: 20,
    rationale: "Cash flow is king in PE — financial performance is the primary driver of returns",
  },
  {
    key: "market_attractiveness",
    label: "Market Attractiveness",
    defaultWeight: 15,
    rationale: "Attractive markets provide organic tailwinds and exit optionality",
  },
  {
    key: "value_creation_potential",
    label: "Value Creation Potential",
    defaultWeight: 15,
    rationale: "The firm's ability to improve the business post-acquisition drives returns",
  },
  {
    key: "competitive_position",
    label: "Competitive Position",
    defaultWeight: 12,
    rationale: "Defensibility protects margins and enables pricing power",
  },
  {
    key: "customer_quality",
    label: "Customer Quality",
    defaultWeight: 10,
    rationale: "Revenue quality and concentration directly affect risk and valuation",
  },
  {
    key: "risk_profile",
    label: "Risk Profile",
    defaultWeight: 10,
    rationale: "Overall risk level determines probability of achieving thesis",
  },
  {
    key: "strategic_fit",
    label: "Strategic Fit",
    defaultWeight: 8,
    rationale: "Alignment with Catalyze's capabilities and portfolio",
  },
  {
    key: "valuation_attractiveness",
    label: "Valuation Attractiveness",
    defaultWeight: 5,
    rationale: "Price is what you pay; value is what you get — but a bad price can sink returns",
  },
  {
    key: "transaction_feasibility",
    label: "Transaction Feasibility",
    defaultWeight: 3,
    rationale: "Process dynamics affect ability to close but not intrinsic value",
  },
  {
    key: "management_team",
    label: "Management & Team",
    defaultWeight: 2,
    rationale: "Important but can be supplemented post-acquisition in lower middle market",
  },
];

export const IP_DIMENSIONS: DimensionConfig[] = [
  {
    key: "technology_readiness",
    label: "Technology Readiness",
    defaultWeight: 18,
    rationale: "Immature tech = high risk of failure; TRL is the primary gating criterion",
  },
  {
    key: "ip_strength_defensibility",
    label: "IP Strength & Defensibility",
    defaultWeight: 16,
    rationale: "Without strong IP, there is no sustainable competitive advantage",
  },
  {
    key: "market_attractiveness",
    label: "Market Attractiveness",
    defaultWeight: 15,
    rationale: "Even great technology needs a large, growing market",
  },
  {
    key: "commercialization_pathway",
    label: "Commercialization Pathway",
    defaultWeight: 14,
    rationale: "A clear path to revenue is essential — technology without a business model is a hobby",
  },
  {
    key: "orthogonal_application_potential",
    label: "Orthogonal Application Potential",
    defaultWeight: 12,
    rationale: "Core Catalyze thesis: multi-market applicability multiplies value",
  },
  {
    key: "competitive_position",
    label: "Competitive Position",
    defaultWeight: 8,
    rationale: "Technology advantage relative to alternatives and incumbents",
  },
  {
    key: "value_creation_potential",
    label: "Value Creation Potential",
    defaultWeight: 7,
    rationale: "Ability to grow and scale post-acquisition",
  },
  {
    key: "risk_profile",
    label: "Risk Profile",
    defaultWeight: 5,
    rationale: "Overall risk assessment",
  },
  {
    key: "strategic_fit",
    label: "Strategic Fit",
    defaultWeight: 3,
    rationale: "Portfolio and capability alignment",
  },
  {
    key: "management_team",
    label: "Management & Team",
    defaultWeight: 2,
    rationale: "Can be built from scratch for technology spinouts",
  },
];

// ---------------------------------------------------------------------------
// Sample deal scores used for the live composite preview
// ---------------------------------------------------------------------------

/** Representative sample scores for a mid-quality PE deal. */
const PE_SAMPLE_SCORES: Record<string, number> = {
  financial_quality: 6,
  market_attractiveness: 7,
  value_creation_potential: 7,
  competitive_position: 6,
  customer_quality: 5,
  risk_profile: 5,
  strategic_fit: 7,
  valuation_attractiveness: 6,
  transaction_feasibility: 7,
  management_team: 6,
};

/** Representative sample scores for a mid-quality IP/Technology deal. */
const IP_SAMPLE_SCORES: Record<string, number> = {
  technology_readiness: 7,
  ip_strength_defensibility: 8,
  market_attractiveness: 7,
  commercialization_pathway: 6,
  orthogonal_application_potential: 8,
  competitive_position: 6,
  value_creation_potential: 7,
  risk_profile: 5,
  strategic_fit: 7,
  management_team: 6,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WeightMap = Record<string, number>;
type ActiveTrack = "traditional_pe" | "ip_technology";

function buildDefaultWeightMap(dims: DimensionConfig[]): WeightMap {
  return Object.fromEntries(dims.map((d) => [d.key, d.defaultWeight]));
}

function computeComposite(weights: WeightMap, scores: Record<string, number>): number {
  let raw = 0;
  for (const [key, w] of Object.entries(weights)) {
    raw += ((scores[key] ?? 5) * w) / 100;
  }
  return Math.round(Math.min(10, Math.max(1, raw)) * 10) / 10;
}

function getRecommendation(
  score: number,
  proceed: number,
  furtherReview: number,
): "PROCEED" | "FURTHER_REVIEW" | "PASS" {
  if (score >= proceed) return "PROCEED";
  if (score >= furtherReview) return "FURTHER_REVIEW";
  return "PASS";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface WeightSliderProps {
  dim: DimensionConfig;
  value: number;
  onChange: (key: string, value: number) => void;
}

function WeightSlider({ dim, value, onChange }: WeightSliderProps) {
  return (
    <div className="group">
      <div className="mb-1 flex items-baseline justify-between">
        <div>
          <span className="text-sm font-medium text-slate-200">{dim.label}</span>
          <p className="mt-0.5 text-xs text-slate-500 leading-tight">{dim.rationale}</p>
        </div>
        <span className="ml-4 shrink-0 font-mono text-sm font-semibold text-indigo-300">
          {value}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(dim.key, parseInt(e.target.value, 10))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-500"
        />
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => {
            const v = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
            onChange(dim.key, v);
          }}
          className="w-16 shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-center font-mono text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props passed from the server page
// ---------------------------------------------------------------------------

export interface InitialConfig {
  peWeights: WeightMap | null;
  ipWeights: WeightMap | null;
  proceedThreshold: number;
  furtherReviewThreshold: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminSettingsClient({ initial }: { initial: InitialConfig }) {
  const [activeTrack, setActiveTrack] = useState<ActiveTrack>("traditional_pe");

  // Weight state — one map per track
  const [peWeights, setPeWeights] = useState<WeightMap>(
    initial.peWeights ?? buildDefaultWeightMap(PE_DIMENSIONS),
  );
  const [ipWeights, setIpWeights] = useState<WeightMap>(
    initial.ipWeights ?? buildDefaultWeightMap(IP_DIMENSIONS),
  );

  // Threshold state
  const [proceedThreshold, setProceedThreshold] = useState<number>(
    initial.proceedThreshold,
  );
  const [furtherReviewThreshold, setFurtherReviewThreshold] = useState<number>(
    initial.furtherReviewThreshold,
  );

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const peSum = useMemo(
    () => Object.values(peWeights).reduce((a, b) => a + b, 0),
    [peWeights],
  );
  const ipSum = useMemo(
    () => Object.values(ipWeights).reduce((a, b) => a + b, 0),
    [ipWeights],
  );

  const currentWeights = activeTrack === "traditional_pe" ? peWeights : ipWeights;
  const currentSum = activeTrack === "traditional_pe" ? peSum : ipSum;
  const currentSampleScores =
    activeTrack === "traditional_pe" ? PE_SAMPLE_SCORES : IP_SAMPLE_SCORES;

  const previewScore = useMemo(
    () => computeComposite(currentWeights, currentSampleScores),
    [currentWeights, currentSampleScores],
  );

  const previewRecommendation = useMemo(
    () => getRecommendation(previewScore, proceedThreshold, furtherReviewThreshold),
    [previewScore, proceedThreshold, furtherReviewThreshold],
  );

  const weightsValid = Math.abs(currentSum - 100) < 0.1;
  const thresholdsValid =
    furtherReviewThreshold < proceedThreshold &&
    proceedThreshold >= 1 &&
    proceedThreshold <= 10 &&
    furtherReviewThreshold >= 1 &&
    furtherReviewThreshold <= 10;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleWeightChange = useCallback(
    (key: string, value: number) => {
      if (activeTrack === "traditional_pe") {
        setPeWeights((prev) => ({ ...prev, [key]: value }));
      } else {
        setIpWeights((prev) => ({ ...prev, [key]: value }));
      }
      setSaveMessage(null);
    },
    [activeTrack],
  );

  const handleResetToDefaults = useCallback(() => {
    if (activeTrack === "traditional_pe") {
      setPeWeights(buildDefaultWeightMap(PE_DIMENSIONS));
    } else {
      setIpWeights(buildDefaultWeightMap(IP_DIMENSIONS));
    }
    setSaveMessage(null);
  }, [activeTrack]);

  const handleSave = useCallback(async () => {
    if (!weightsValid && !thresholdsValid) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const peEntries = Object.entries(peWeights).map(([dimension, weight]) => ({
        dimension,
        weight,
      }));
      const ipEntries = Object.entries(ipWeights).map(([dimension, weight]) => ({
        dimension,
        weight,
      }));

      const result = await saveScoringConfig(peEntries, ipEntries, {
        proceed: proceedThreshold,
        furtherReview: furtherReviewThreshold,
      });

      if (result.success) {
        setSaveMessage({ type: "success", text: "Settings saved successfully." });
      } else {
        setSaveMessage({
          type: "error",
          text: result.error ?? "Unknown error occurred.",
        });
      }
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Unexpected error.",
      });
    } finally {
      setSaving(false);
    }
  }, [peWeights, ipWeights, proceedThreshold, furtherReviewThreshold, weightsValid, thresholdsValid]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const activeDimensions =
    activeTrack === "traditional_pe" ? PE_DIMENSIONS : IP_DIMENSIONS;

  function verdictBadge(v: ReturnType<typeof getRecommendation>) {
    switch (v) {
      case "PROCEED":
        return (
          <span className="rounded-full bg-emerald-500/20 px-3 py-0.5 font-mono text-sm font-semibold text-emerald-300 border border-emerald-500/40">
            PROCEED
          </span>
        );
      case "FURTHER_REVIEW":
        return (
          <span className="rounded-full bg-amber-500/20 px-3 py-0.5 font-mono text-sm font-semibold text-amber-300 border border-amber-500/40">
            FURTHER REVIEW
          </span>
        );
      case "PASS":
        return (
          <span className="rounded-full bg-red-500/20 px-3 py-0.5 font-mono text-sm font-semibold text-red-300 border border-red-500/40">
            PASS
          </span>
        );
    }
  }

  function scoreColor(score: number) {
    if (score >= 7.5) return "text-emerald-400";
    if (score >= 5.5) return "text-amber-400";
    return "text-red-400";
  }

  const sumColor =
    Math.abs(currentSum - 100) < 0.1
      ? "text-emerald-400"
      : currentSum > 100
        ? "text-red-400"
        : "text-amber-400";

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Admin Settings</h1>
            <p className="mt-1 text-sm text-slate-400">
              Configure dimension weights and recommendation thresholds.
            </p>
          </div>
          {/* Save button */}
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span
                className={`text-sm ${
                  saveMessage.type === "success" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {saveMessage.text}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !weightsValid || !thresholdsValid}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Track switcher + preset reset */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            <button
              onClick={() => setActiveTrack("traditional_pe")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTrack === "traditional_pe"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Traditional PE
            </button>
            <button
              onClick={() => setActiveTrack("ip_technology")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTrack === "ip_technology"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              IP / Technology
            </button>
          </div>

          <button
            onClick={handleResetToDefaults}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:border-indigo-500 hover:text-slate-200"
          >
            Reset to PRD Defaults
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: weight sliders */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              {/* Header with live sum */}
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-slate-100">
                  {activeTrack === "traditional_pe"
                    ? "Traditional PE — Dimension Weights"
                    : "IP / Technology — Dimension Weights"}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Sum:</span>
                  <span className={`font-mono text-sm font-bold ${sumColor}`}>
                    {currentSum}%
                  </span>
                  {Math.abs(currentSum - 100) > 0.1 && (
                    <span className="text-xs text-amber-400">
                      (must equal 100%)
                    </span>
                  )}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-5">
                {activeDimensions.map((dim) => (
                  <WeightSlider
                    key={dim.key}
                    dim={dim}
                    value={currentWeights[dim.key] ?? dim.defaultWeight}
                    onChange={handleWeightChange}
                  />
                ))}
              </div>

              {/* Validation warning */}
              {!weightsValid && (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  ⚠ Weights must sum to exactly 100%. Current sum:{" "}
                  <span className="font-mono font-semibold">{currentSum}%</span>
                </div>
              )}
            </div>

            {/* Recommendation thresholds */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-4 font-semibold text-slate-100">
                Recommendation Thresholds
              </h2>
              <p className="mb-5 text-xs text-slate-400">
                Composite scores are on a 1–10 scale. Thresholds apply to both
                deal tracks.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* PROCEED threshold */}
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-300">
                      PROCEED
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-slate-400">
                    Score at or above this value → move to LOI.
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={0.1}
                    value={proceedThreshold}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setProceedThreshold(Math.min(10, Math.max(1, v)));
                      setSaveMessage(null);
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-center font-mono text-lg font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* FURTHER REVIEW threshold */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-sm font-semibold text-amber-300">
                      FURTHER REVIEW
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-slate-400">
                    Score at or above this value (and below PROCEED) → review.
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={0.1}
                    value={furtherReviewThreshold}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setFurtherReviewThreshold(Math.min(10, Math.max(1, v)));
                      setSaveMessage(null);
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-center font-mono text-lg font-bold text-amber-300 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* PASS label */}
              <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-sm font-semibold text-red-300">PASS</span>
                  <span className="ml-auto font-mono text-xs text-slate-400">
                    Score below {furtherReviewThreshold.toFixed(1)}
                  </span>
                </div>
              </div>

              {!thresholdsValid && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  ⚠ PROCEED threshold must be greater than FURTHER REVIEW threshold, and both must be between 1.0 and 10.0.
                </div>
              )}
            </div>
          </div>

          {/* Right column: live preview */}
          <div className="space-y-4">
            <div className="sticky top-6 space-y-4">
              {/* Live preview card */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h3 className="mb-1 text-sm font-semibold text-slate-300">
                  Live Score Preview
                </h3>
                <p className="mb-4 text-xs text-slate-500 leading-snug">
                  Composite score for a representative mid-quality deal using
                  the current weights.
                </p>

                {/* Big composite score */}
                <div className="mb-4 text-center">
                  <div
                    className={`font-mono text-5xl font-bold tabular-nums ${scoreColor(previewScore)}`}
                  >
                    {previewScore.toFixed(1)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">/ 10.0</div>
                </div>

                {/* Recommendation badge */}
                <div className="flex justify-center">
                  {verdictBadge(previewRecommendation)}
                </div>

                {/* Threshold legend */}
                <div className="mt-5 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span className="text-emerald-400">PROCEED</span>
                    <span className="font-mono">
                      ≥ {proceedThreshold.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span className="text-amber-400">FURTHER REVIEW</span>
                    <span className="font-mono">
                      ≥ {furtherReviewThreshold.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span className="text-red-400">PASS</span>
                    <span className="font-mono">
                      &lt; {furtherReviewThreshold.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Per-dimension breakdown */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
                  Sample Scores Used
                </h3>
                <div className="space-y-2">
                  {activeDimensions.map((dim) => {
                    const sampleScore = currentSampleScores[dim.key] ?? 5;
                    const w = currentWeights[dim.key] ?? 0;
                    const contribution = (sampleScore * w) / 100;
                    return (
                      <div key={dim.key} className="flex items-center justify-between">
                        <span className="truncate text-xs text-slate-400" title={dim.label}>
                          {dim.label}
                        </span>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">
                            {sampleScore}/10
                          </span>
                          <span className="font-mono text-xs text-indigo-400">
                            +{contribution.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
