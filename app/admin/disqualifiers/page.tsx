/**
 * Admin Disqualifiers Page — app/admin/disqualifiers/page.tsx
 *
 * Server Component that:
 * 1. Verifies the user is authenticated and has the "admin" role.
 * 2. Fetches all disqualifier rules from Supabase, ordered by created_at.
 * 3. Renders DisqualifiersClient with the pre-loaded data.
 *
 * PRD §3.6  — Hard disqualifiers (automatic PASS rules)
 * PRD §6.2.5 — Settings / Admin Page
 * PRD §7.3  — RLS: only admins may write disqualifiers
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DisqualifiersClient from "./DisqualifiersClient";
import type { DisqualifierRow } from "@/lib/actions/saveDisqualifier";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function loadDisqualifiers(): Promise<DisqualifierRow[]> {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) return [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("disqualifiers")
      .select("id, name, description, field, operator, value, is_active, created_at, updated_at")
      .order("created_at", { ascending: true })
      .returns<DisqualifierRow[]>();

    return data ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminDisqualifiersPage() {
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

  // 3. Load disqualifiers
  const disqualifiers = await loadDisqualifiers();

  return <DisqualifiersClient initial={disqualifiers} />;
}
