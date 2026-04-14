"use server";

/**
 * saveScoringConfig — Next.js Server Action
 *
 * Persists dimension weights (scoring_config table) and recommendation
 * thresholds (scoring_thresholds table) to Supabase.
 *
 * Only admin users may call this action; the RLS policies on scoring_config
 * and scoring_thresholds enforce this at the database level too.
 */

import { createClient } from "../supabase/server";

export type TrackKey = "traditional_pe" | "ip_technology";

/** Dimension weight entry for one (track, dimension) pair. */
export interface DimensionWeightEntry {
  track: TrackKey;
  dimension: string;
  weight: number;
}

/** Threshold values for the PROCEED / FURTHER_REVIEW buckets. */
export interface ThresholdValues {
  proceed: number;
  furtherReview: number;
}

export interface SaveScoringConfigResult {
  success: boolean;
  error?: string;
}

/**
 * Upserts dimension weights for a given track into scoring_config and updates
 * the global scoring_thresholds row.
 *
 * @param peWeights      - Array of { dimension, weight } for the Traditional PE track.
 * @param ipWeights      - Array of { dimension, weight } for the IP/Technology track.
 * @param thresholds     - PROCEED and FURTHER_REVIEW threshold values.
 */
export async function saveScoringConfig(
  peWeights: { dimension: string; weight: number }[],
  ipWeights: { dimension: string; weight: number }[],
  thresholds: ThresholdValues,
): Promise<SaveScoringConfigResult> {
  const supabase = await createClient();

  // ------------------------------------------------------------------
  // 1. Verify the caller is authenticated and has the admin role.
  // ------------------------------------------------------------------
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      success: false,
      error: "Insufficient permissions. Admin role required.",
    };
  }

  // ------------------------------------------------------------------
  // 2. Validate weights sum to 100 for each track.
  // ------------------------------------------------------------------
  const peSum = peWeights.reduce((acc, w) => acc + w.weight, 0);
  if (Math.abs(peSum - 100) > 0.1) {
    return {
      success: false,
      error: `PE track weights must sum to 100%; current sum is ${peSum.toFixed(1)}%.`,
    };
  }

  const ipSum = ipWeights.reduce((acc, w) => acc + w.weight, 0);
  if (Math.abs(ipSum - 100) > 0.1) {
    return {
      success: false,
      error: `IP/Tech track weights must sum to 100%; current sum is ${ipSum.toFixed(1)}%.`,
    };
  }

  // ------------------------------------------------------------------
  // 3. Validate thresholds.
  // ------------------------------------------------------------------
  if (thresholds.furtherReview >= thresholds.proceed) {
    return {
      success: false,
      error:
        "PROCEED threshold must be greater than FURTHER REVIEW threshold.",
    };
  }
  if (thresholds.proceed < 1 || thresholds.proceed > 10) {
    return {
      success: false,
      error: "PROCEED threshold must be between 1.0 and 10.0.",
    };
  }
  if (thresholds.furtherReview < 1 || thresholds.furtherReview > 10) {
    return {
      success: false,
      error: "FURTHER REVIEW threshold must be between 1.0 and 10.0.",
    };
  }

  // ------------------------------------------------------------------
  // 4. Upsert scoring_config rows (one per dimension per track).
  // ------------------------------------------------------------------
  const peRows = peWeights.map((w) => ({
    track: "traditional_pe" as TrackKey,
    dimension: w.dimension,
    weight: w.weight,
    updated_by: user.id,
  }));

  const ipRows = ipWeights.map((w) => ({
    track: "ip_technology" as TrackKey,
    dimension: w.dimension,
    weight: w.weight,
    updated_by: user.id,
  }));

  const { error: configError } = await supabase
    .from("scoring_config")
    .upsert([...peRows, ...ipRows], { onConflict: "track,dimension" });

  if (configError) {
    return {
      success: false,
      error: `Failed to save scoring config: ${configError.message}`,
    };
  }

  // ------------------------------------------------------------------
  // 5. Upsert scoring_thresholds (single global row; insert if missing).
  // ------------------------------------------------------------------
  // Read the existing row's id to perform a targeted update; fall back to
  // inserting a new row when the table is empty.
  const { data: existing } = await supabase
    .from("scoring_thresholds")
    .select("id")
    .limit(1)
    .single();

  if (existing?.id) {
    const { error: thresholdError } = await supabase
      .from("scoring_thresholds")
      .update({
        proceed_threshold: thresholds.proceed,
        further_review_threshold: thresholds.furtherReview,
        updated_by: user.id,
      })
      .eq("id", existing.id);

    if (thresholdError) {
      return {
        success: false,
        error: `Failed to save thresholds: ${thresholdError.message}`,
      };
    }
  } else {
    const { error: thresholdError } = await supabase
      .from("scoring_thresholds")
      .insert({
        proceed_threshold: thresholds.proceed,
        further_review_threshold: thresholds.furtherReview,
        updated_by: user.id,
      });

    if (thresholdError) {
      return {
        success: false,
        error: `Failed to save thresholds: ${thresholdError.message}`,
      };
    }
  }

  return { success: true };
}
