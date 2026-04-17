/**
 * API Usage Dashboard — app/admin/usage/page.tsx
 *
 * Server Component that:
 * 1. Verifies the user is authenticated and has the "admin" role.
 * 2. Fetches usage statistics from api_usage_log and screenings.
 * 3. Renders UsageDashboardClient with all pre-loaded data.
 *
 * PRD §6.2.5 — Settings / Admin Page: API usage dashboard
 * PRD §2.4   — Rate limiting: max 50 screenings per day
 * PRD §7.1   — api_usage_log: id, screening_id, user_id, model,
 *               input_tokens, output_tokens, cost_estimate, latency_ms, created_at
 * PRD §7.3   — api_usage_log is read-only for all authenticated users
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UsageDashboardClient, {
  type DailyUsage,
  type ExpensiveScreening,
  type UsageSummary,
} from "./UsageDashboardClient";

// ---------------------------------------------------------------------------
// Supabase row shapes
// ---------------------------------------------------------------------------

interface UsageLogRow {
  id: string;
  screening_id: string | null;
  cost_estimate: number | null;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
  screenings: { company_name: string } | null;
}

// ---------------------------------------------------------------------------
// Data-fetching helpers
// ---------------------------------------------------------------------------

/** Start of the current UTC calendar month as an ISO string. */
function startOfMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Start of today (UTC) as an ISO string. */
function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** ISO date string (YYYY-MM-DD) for a UTC Date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------

async function loadUsageData(): Promise<{
  summary: UsageSummary;
  dailyUsage: DailyUsage[];
  expensiveScreenings: ExpensiveScreening[];
}> {
  const DAILY_LIMIT = 50;

  // Default / demo-mode values
  const defaultSummary: UsageSummary = {
    screeningsThisMonth: 0,
    totalCostThisMonth: 0,
    avgCostPerScreening: 0,
    avgLatencyMs: 0,
    todayCount: 0,
    dailyLimit: DAILY_LIMIT,
  };

  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) {
    return { summary: defaultSummary, dailyUsage: [], expensiveScreenings: [] };
  }

  const supabase = await createClient();
  const monthStart = startOfMonthUtc();
  const todayStart = startOfTodayUtc();

  // Fetch all successful api_usage_log rows for this month (error_message IS NULL)
  const { data: monthRows } = await supabase
    .from("api_usage_log")
    .select("id, screening_id, cost_estimate, latency_ms, error_message, created_at, screenings(company_name)")
    .is("error_message", null)
    .gte("created_at", monthStart)
    .order("created_at", { ascending: true })
    .returns<UsageLogRow[]>();

  const rows: UsageLogRow[] = monthRows ?? [];

  // ---------------------------------------------------------------------------
  // Summary metrics
  // ---------------------------------------------------------------------------

  const totalCost = rows.reduce((sum, r) => sum + (r.cost_estimate ?? 0), 0);
  const latencies = rows.filter((r) => r.latency_ms !== null).map((r) => r.latency_ms as number);
  const avgLatencyMs =
    latencies.length > 0 ? latencies.reduce((s, v) => s + v, 0) / latencies.length : 0;

  // Count distinct screenings this month (a single screening may trigger multiple API calls)
  const distinctScreeningIds = new Set(rows.map((r) => r.screening_id).filter(Boolean));
  const screeningsThisMonth = distinctScreeningIds.size;
  const avgCostPerScreening = screeningsThisMonth > 0 ? totalCost / screeningsThisMonth : 0;

  // Today's count for rate-limit indicator (count API calls today, not distinct screenings)
  const todayCount = rows.filter((r) => r.created_at >= todayStart).length;

  const summary: UsageSummary = {
    screeningsThisMonth,
    totalCostThisMonth: totalCost,
    avgCostPerScreening,
    avgLatencyMs,
    todayCount,
    dailyLimit: DAILY_LIMIT,
  };

  // ---------------------------------------------------------------------------
  // Daily usage for the past 30 days bar chart
  // ---------------------------------------------------------------------------

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  // Fetch rows for the past 30 days (may overlap with month rows above, but the
  // month might be less than 30 days old so we need a separate query boundary)
  const past30Start = thirtyDaysAgo.toISOString();

  const { data: past30Rows } = await supabase
    .from("api_usage_log")
    .select("created_at, cost_estimate")
    .is("error_message", null)
    .gte("created_at", past30Start)
    .returns<{ created_at: string; cost_estimate: number | null }[]>();

  // Build a map: date → { calls, cost }
  const dailyMap = new Map<string, { calls: number; cost: number }>();

  // Pre-populate all 30 days so days with zero calls still appear on the chart
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setUTCDate(d.getUTCDate() + i);
    dailyMap.set(isoDate(d), { calls: 0, cost: 0 });
  }

  for (const r of past30Rows ?? []) {
    const day = r.created_at.slice(0, 10);
    const entry = dailyMap.get(day);
    if (entry) {
      entry.calls += 1;
      entry.cost += r.cost_estimate ?? 0;
    }
  }

  const dailyUsage: DailyUsage[] = Array.from(dailyMap.entries()).map(([date, { calls, cost }]) => ({
    date,
    calls,
    cost,
  }));

  // ---------------------------------------------------------------------------
  // Top 10 most expensive screenings this month
  // ---------------------------------------------------------------------------

  // Aggregate cost per screening_id across all month rows
  const screeningCostMap = new Map<
    string,
    { companyName: string; totalCost: number; date: string; calls: number }
  >();

  for (const r of rows) {
    if (!r.screening_id) continue;
    const existing = screeningCostMap.get(r.screening_id);
    const name =
      r.screenings && "company_name" in r.screenings
        ? (r.screenings as { company_name: string }).company_name
        : r.screening_id;

    if (existing) {
      existing.totalCost += r.cost_estimate ?? 0;
      existing.calls += 1;
    } else {
      screeningCostMap.set(r.screening_id, {
        companyName: name,
        totalCost: r.cost_estimate ?? 0,
        date: r.created_at,
        calls: 1,
      });
    }
  }

  const expensiveScreenings: ExpensiveScreening[] = Array.from(screeningCostMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 10);

  return { summary, dailyUsage, expensiveScreenings };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminUsagePage() {
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
    redirect("/");
  }

  // 3. Load usage data
  const { summary, dailyUsage, expensiveScreenings } = await loadUsageData();

  return (
    <UsageDashboardClient
      summary={summary}
      dailyUsage={dailyUsage}
      expensiveScreenings={expensiveScreenings}
    />
  );
}
