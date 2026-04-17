/**
 * Deal Comparison Page — app/compare/page.tsx
 *
 * Server Component that:
 * 1. Verifies the user is authenticated (redirects to /login otherwise).
 * 2. Fetches all screenings with composite scores, recommendation, and
 *    snapshot / dimension-score data.
 * 3. Maps database rows to CompareRow objects for the client component.
 * 4. Renders CompareClient for interactive deal selection and comparison.
 *
 * PRD §6.2.4 — Deal Comparison Page
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompareClient from "./CompareClient";
import type { CompareRow } from "./CompareClient";
import type { ScoringResult } from "@/lib/scoringEngine";
import type { ISTAnalysis } from "@/types/ist-analysis";

// ---------------------------------------------------------------------------
// Supabase row shape
// ---------------------------------------------------------------------------

interface SnapshotJson {
  revenue?: number | null;
  ebitda?: number | null;
  ebitda_margin?: number | null;
  revenue_growth_rate?: number | null;
  ev_ebitda_multiple?: number | null;
  [key: string]: unknown;
}

interface ScreeningListRow {
  id: string;
  company_name: string;
  deal_type: string | null;
  composite_score: number | null;
  recommendation: "PROCEED" | "FURTHER_REVIEW" | "PASS" | null;
  snapshot_json: SnapshotJson | null;
  scores_json: ScoringResult | null;
  ai_response_json: ISTAnalysis | null;
}

// ---------------------------------------------------------------------------
// Dimension-score extraction
// ---------------------------------------------------------------------------

const IP_DIMENSION_KEYS = [
  "technologyReadiness",
  "ipStrengthDefensibility",
  "commercializationPathway",
  "orthogonalApplicationPotential",
] as const;

/**
 * Extracts a map of dimension → score from a screening row.
 * Prefers the pre-computed scores_json; falls back to ai_response_json sections.
 */
function extractDimensionScores(
  row: ScreeningListRow,
): Partial<Record<string, number | null>> {
  const scores: Partial<Record<string, number | null>> = {};

  // 1. Use pre-computed scores_json (most reliable for PE dimensions)
  if (row.scores_json?.dimensionScores) {
    const ds = row.scores_json.dimensionScores as Record<string, number>;
    for (const [dim, val] of Object.entries(ds)) {
      if (typeof val === "number") {
        scores[dim] = val;
      }
    }
  }

  // 2. Fill in any missing scores from ai_response_json sections
  const analysis = row.ai_response_json;
  if (analysis) {
    const peDims = [
      "companyOverview",
      "marketOpportunity",
      "financialProfile",
      "managementTeam",
      "investmentThesis",
      "riskAssessment",
      "dealDynamics",
    ] as const;

    for (const dim of peDims) {
      if (scores[dim] === undefined) {
        const section = analysis[dim];
        if (section && typeof section === "object" && "score" in section) {
          scores[dim] = (section as { score: number }).score;
        }
      }
    }

    // IP/Tech track sections
    for (const dim of IP_DIMENSION_KEYS) {
      if (scores[dim] === undefined) {
        const section = analysis[dim];
        if (section && typeof section === "object" && "score" in section) {
          scores[dim] = (section as { score: number }).score;
        }
      }
    }
  }

  return scores;
}

/**
 * Maps a raw Supabase row to a CompareRow for the client component.
 */
function toCompareRow(row: ScreeningListRow): CompareRow {
  const snap = row.snapshot_json;
  return {
    id: row.id,
    companyName: row.company_name,
    dealType: row.deal_type,
    compositeScore: row.composite_score,
    recommendation: row.recommendation,
    revenue: snap?.revenue ?? null,
    ebitda: snap?.ebitda ?? null,
    ebitdaMargin: snap?.ebitda_margin ?? null,
    revenueGrowthRate: snap?.revenue_growth_rate ?? null,
    evEbitdaMultiple: snap?.ev_ebitda_multiple ?? null,
    dimensionScores: extractDimensionScores(row),
  };
}

// ---------------------------------------------------------------------------
// Demo rows (used when Supabase is not configured)
// ---------------------------------------------------------------------------

const DEMO_ROWS: CompareRow[] = [
  {
    id: "demo",
    companyName: "Acme Industrial Holdings",
    dealType: "traditional_pe",
    compositeScore: 6.0,
    recommendation: "FURTHER_REVIEW",
    revenue: 85_000_000,
    ebitda: 11_900_000,
    ebitdaMargin: 14.0,
    revenueGrowthRate: 6.0,
    evEbitdaMultiple: 8.5,
    dimensionScores: {
      companyOverview: 7,
      marketOpportunity: 6,
      financialProfile: 5,
      managementTeam: 7,
      investmentThesis: 7,
      riskAssessment: 4,
      dealDynamics: 6,
    },
  },
  {
    id: "demo-ip",
    companyName: "NovaPhoLaser IP Portfolio",
    dealType: "ip_technology",
    compositeScore: 7.4,
    recommendation: "FURTHER_REVIEW",
    revenue: 2_100_000,
    ebitda: null,
    ebitdaMargin: null,
    revenueGrowthRate: null,
    evEbitdaMultiple: null,
    dimensionScores: {
      companyOverview: 7,
      marketOpportunity: 8,
      financialProfile: 5,
      managementTeam: 6,
      investmentThesis: 8,
      riskAssessment: 5,
      dealDynamics: 6,
      technologyReadiness: 8,
      ipStrengthDefensibility: 8,
      commercializationPathway: 7,
      orthogonalApplicationPotential: 9,
    },
  },
  {
    id: "demo-pe2",
    companyName: "Summit Distribution Co.",
    dealType: "traditional_pe",
    compositeScore: 7.8,
    recommendation: "PROCEED",
    revenue: 142_000_000,
    ebitda: 24_140_000,
    ebitdaMargin: 17.0,
    revenueGrowthRate: 11.0,
    evEbitdaMultiple: 7.5,
    dimensionScores: {
      companyOverview: 8,
      marketOpportunity: 7,
      financialProfile: 8,
      managementTeam: 8,
      investmentThesis: 8,
      riskAssessment: 7,
      dealDynamics: 7,
    },
  },
  {
    id: "demo-pass",
    companyName: "Westbrook Manufacturing",
    dealType: "traditional_pe",
    compositeScore: 4.2,
    recommendation: "PASS",
    revenue: 38_000_000,
    ebitda: 2_280_000,
    ebitdaMargin: 6.0,
    revenueGrowthRate: -3.0,
    evEbitdaMultiple: 11.5,
    dimensionScores: {
      companyOverview: 4,
      marketOpportunity: 4,
      financialProfile: 3,
      managementTeam: 5,
      investmentThesis: 4,
      riskAssessment: 3,
      dealDynamics: 5,
    },
  },
];

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function loadCompareRows(): Promise<CompareRow[]> {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) {
    return DEMO_ROWS;
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("screenings")
      .select(
        `id,
         company_name,
         deal_type,
         composite_score,
         recommendation,
         snapshot_json,
         scores_json,
         ai_response_json`,
      )
      .not("composite_score", "is", null)
      .order("created_at", { ascending: false })
      .returns<ScreeningListRow[]>();

    if (error || !data) {
      console.error("Failed to load screenings for comparison:", error?.message);
      return [];
    }

    return data.map(toCompareRow);
  } catch (err) {
    console.error("Error loading screenings for comparison:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ComparePage() {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Auth guard — skip in demo mode
  if (hasSupabase) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }
  }

  const rows = await loadCompareRows();

  return <CompareClient rows={rows} />;
}
