/**
 * Admin Team Management Page — app/admin/team/page.tsx
 *
 * Server Component that:
 * 1. Verifies the user is authenticated and has the "admin" role.
 * 2. Fetches the full team member list from the users table.
 * 3. Renders TeamClient with the pre-loaded members.
 *
 * PRD §6.2.5 — Team management: invite/remove users, assign roles
 * PRD §7.1   — users table: id, email, name, role, last_login_at, created_at
 * PRD §7.3   — RLS: only admins may write user records
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTeamMembers } from "@/lib/actions/teamManagement";
import TeamClient from "./TeamClient";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminTeamPage() {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Role check — only admins may access this page (PRD §6.2.5, §7.3)
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  // 3. Load team members
  const members = await listTeamMembers();

  return <TeamClient initialMembers={members} currentUserId={user.id} />;
}
