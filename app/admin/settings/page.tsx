/**
 * Admin Settings Page — app/admin/settings/page.tsx
 *
 * Server Component that:
 * 1. Verifies the user is authenticated and has the "admin" role.
 * 2. Fetches the current scoring_config and scoring_thresholds from Supabase.
 * 3. Renders AdminSettingsClient with the pre-populated configuration.
 *
 * PRD §6.2.5 — Settings / Admin Page
 * PRD §7.3   — RLS: only admins may write scoring_config
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminSettingsClient, {
  PE_DIMENSIONS,
  IP_DIMENSIONS,
} from "./AdminSettingsClient";
import type { InitialConfig } from "./AdminSettingsClient";

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

type WeightRow = {
  track: string;
  dimension: string;
  weight: number;
};

type ThresholdRow = {
  proceed_threshold: number;
  further_review_threshold: number;
};

async function loadConfig(): Promise<InitialConfig> {
  // Default values from PRD §3.5 and §3.6
  const defaultConfig: InitialConfig = {
    peWeights: null,
    ipWeights: null,
    proceedThreshold: 7.5,
    furtherReviewThreshold: 5.5,
  };

  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) return defaultConfig;

  try {
    const supabase = await createClient();

    // Load dimension weights
    const { data: weightRows } = await supabase
      .from("scoring_config")
      .select("track, dimension, weight")
      .in("track", ["traditional_pe", "ip_technology"])
      .returns<WeightRow[]>();

    let peWeights: Record<string, number> | null = null;
    let ipWeights: Record<string, number> | null = null;

    if (weightRows && weightRows.length > 0) {
      const peRows = weightRows.filter((r) => r.track === "traditional_pe");
      const ipRows = weightRows.filter((r) => r.track === "ip_technology");

      if (peRows.length > 0) {
        peWeights = Object.fromEntries(peRows.map((r) => [r.dimension, Number(r.weight)]));

        // Fill in any dimensions missing from the DB with PRD defaults
        for (const dim of PE_DIMENSIONS) {
          if (!(dim.key in peWeights)) {
            peWeights[dim.key] = dim.defaultWeight;
          }
        }
      }

      if (ipRows.length > 0) {
        ipWeights = Object.fromEntries(ipRows.map((r) => [r.dimension, Number(r.weight)]));

        for (const dim of IP_DIMENSIONS) {
          if (!(dim.key in ipWeights)) {
            ipWeights[dim.key] = dim.defaultWeight;
          }
        }
      }
    }

    // Load thresholds
    const { data: thresholdRow } = await supabase
      .from("scoring_thresholds")
      .select("proceed_threshold, further_review_threshold")
      .limit(1)
      .single<ThresholdRow>();

    return {
      peWeights,
      ipWeights,
      proceedThreshold: thresholdRow?.proceed_threshold ?? 7.5,
      furtherReviewThreshold: thresholdRow?.further_review_threshold ?? 5.5,
    };
  } catch {
    return defaultConfig;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminSettingsPage() {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Role check — only admins may access this page
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    // Non-admin users are redirected to the home page
    redirect("/");
  }

  // 3. Load current configuration
  const initial = await loadConfig();

  return <AdminSettingsClient initial={initial} />;
}
