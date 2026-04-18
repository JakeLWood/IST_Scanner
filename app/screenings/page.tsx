/**
 * Screening History / Deal Log Page — app/screenings/page.tsx
 *
 * Server Component that:
 * 1. Verifies the user is authenticated (redirects to /login otherwise).
 * 2. Fetches all screenings with the screened-by user name.
 * 3. Extracts the sector field from ai_response_json (snapshot_json fallback).
 * 4. Renders DealLogClient for interactive search, filter, and sort.
 *
 * PRD §6.2.3 — Screening History / Deal Log Page
 * PRD §7.2   — Full-text search on company_name, raw_document_text, ai response
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DealLogClient from "./DealLogClient";
import type { DealLogRow, ScreeningRecommendation, DealType } from "./DealLogClient";

// ---------------------------------------------------------------------------
// Supabase row shape
// ---------------------------------------------------------------------------

interface ScreeningListRow {
  id: string;
  company_name: string;
  deal_type: DealType | null;
  deal_source: string | null;
  composite_score: number | null;
  recommendation: ScreeningRecommendation | null;
  created_at: string;
  // Nested join to the users table
  users: { name: string | null; email: string | null } | null;
  // JSONB fields for sector extraction
  snapshot_json: Record<string, unknown> | null;
  ai_response_json: Record<string, unknown> | null;
  actual_outcome: string | null;
}

// ---------------------------------------------------------------------------
// Sector extraction
// ---------------------------------------------------------------------------

/**
 * Best-effort sector extraction.
 *
 * Priority:
 *   1. snapshot_json.sector
 *   2. snapshot_json.industry
 *   3. ai_response_json.snapshot.sector (if present)
 *   4. null
 */
function extractSector(row: ScreeningListRow): string | null {
  const snap = row.snapshot_json;
  if (snap) {
    if (typeof snap["sector"] === "string" && snap["sector"]) {
      return snap["sector"] as string;
    }
    if (typeof snap["industry"] === "string" && snap["industry"]) {
      return snap["industry"] as string;
    }
  }

  const ai = row.ai_response_json;
  if (ai) {
    const aiSnap = ai["snapshot"] as Record<string, unknown> | undefined;
    if (aiSnap) {
      if (typeof aiSnap["sector"] === "string" && aiSnap["sector"]) {
        return aiSnap["sector"] as string;
      }
      if (typeof aiSnap["industry"] === "string" && aiSnap["industry"]) {
        return aiSnap["industry"] as string;
      }
    }
    // Some analysis formats store sector at the top level
    if (typeof ai["sector"] === "string" && ai["sector"]) {
      return ai["sector"] as string;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function loadScreenings(): Promise<DealLogRow[]> {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) {
    // Demo mode — return a handful of mock rows for development.
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
         deal_source,
         composite_score,
         recommendation,
         created_at,
         snapshot_json,
         ai_response_json,
         actual_outcome,
         users ( name, email )`
      )
      .order("created_at", { ascending: false })
      .returns<ScreeningListRow[]>();

    if (error || !data) {
      console.error("Failed to load screenings:", error?.message);
      return [];
    }

    return data.map((row) => ({
      id: row.id,
      companyName: row.company_name,
      dateScreened: row.created_at,
      dealType: row.deal_type,
      compositeScore: row.composite_score,
      recommendation: row.recommendation,
      sector: extractSector(row),
      dealSource: row.deal_source,
      screenedBy: row.users?.name ?? row.users?.email ?? null,
      actualOutcome: row.actual_outcome as DealLogRow["actualOutcome"],
    }));
  } catch (err) {
    console.error("Error loading screenings:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Demo rows (used when Supabase is not configured)
// ---------------------------------------------------------------------------

const DEMO_ROWS: DealLogRow[] = [
  {
    id: "demo",
    companyName: "Acme Industrial Holdings",
    dateScreened: "2026-03-01T12:00:00Z",
    dealType: "traditional_pe",
    compositeScore: 6.0,
    recommendation: "FURTHER_REVIEW",
    sector: "Industrials",
    dealSource: "Lincoln International",
    screenedBy: "Jake Wood",
    actualOutcome: null,
  },
  {
    id: "demo-ip",
    companyName: "NovaPhoLaser IP Portfolio",
    dateScreened: "2026-03-15T09:30:00Z",
    dealType: "ip_technology",
    compositeScore: 7.4,
    recommendation: "FURTHER_REVIEW",
    sector: "Photonics / Defense Tech",
    dealSource: "Proprietary",
    screenedBy: "Jake Wood",
    actualOutcome: null,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ScreeningsPage() {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Auth guard — skip in demo mode (no Supabase configured).
  if (hasSupabase) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }
  }

  const rows = await loadScreenings();

  return <DealLogClient rows={rows} />;
}
