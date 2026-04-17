"use server";

/**
 * teamManagement — Next.js Server Actions
 *
 * Provides team management operations for the admin team page:
 *   - listTeamMembers  — fetch all users from the users table
 *   - updateUserRole   — change a user's role (admin only)
 *   - removeUser       — deactivate a user (soft-delete, admin only)
 *   - inviteTeamMember — send a Supabase magic-link invitation (admin only)
 *
 * PRD §6.2.5 — Team management: invite/remove users, assign roles
 * PRD §7.1   — users table schema
 * PRD §7.3   — RLS: admins manage all user records
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "analyst" | "read_only";

export interface TeamMemberRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface TeamActionResult {
  success: boolean;
  error?: string;
  member?: TeamMemberRow;
}

// ---------------------------------------------------------------------------
// Auth helper — verifies the calling user is an authenticated admin
// ---------------------------------------------------------------------------

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, error: "Not authenticated." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    return {
      supabase,
      user: null,
      error: "Insufficient permissions. Admin role required.",
    };
  }

  return { supabase, user, error: null };
}

// ---------------------------------------------------------------------------
// listTeamMembers
// ---------------------------------------------------------------------------

export async function listTeamMembers(): Promise<TeamMemberRow[]> {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) return [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("users")
      .select("id, email, name, role, is_active, last_login_at, created_at")
      .order("created_at", { ascending: true })
      .returns<TeamMemberRow[]>();

    return data ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// updateUserRole
// ---------------------------------------------------------------------------

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<TeamActionResult> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError || !user) {
    return { success: false, error: authError ?? "Not authenticated." };
  }

  if (!["admin", "analyst", "read_only"].includes(role)) {
    return { success: false, error: "Invalid role value." };
  }

  const { data, error } = await supabase
    .from("users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id, email, name, role, is_active, last_login_at, created_at")
    .single<TeamMemberRow>();

  if (error) {
    return {
      success: false,
      error: `Failed to update role: ${error.message}`,
    };
  }

  return { success: true, member: data };
}

// ---------------------------------------------------------------------------
// removeUser
// Soft-deletes the user by setting is_active = false.
// Hard FK constraints on screenings.user_id mean physical deletion risks
// orphaned rows; soft-delete preserves the audit trail.
// ---------------------------------------------------------------------------

export async function removeUser(userId: string): Promise<TeamActionResult> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError || !user) {
    return { success: false, error: authError ?? "Not authenticated." };
  }

  // Prevent admins from deactivating themselves
  if (userId === user.id) {
    return { success: false, error: "You cannot remove your own account." };
  }

  const { data, error } = await supabase
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id, email, name, role, is_active, last_login_at, created_at")
    .single<TeamMemberRow>();

  if (error) {
    return {
      success: false,
      error: `Failed to remove user: ${error.message}`,
    };
  }

  return { success: true, member: data };
}

// ---------------------------------------------------------------------------
// reactivateUser
// Restores a previously deactivated user by setting is_active = true.
// ---------------------------------------------------------------------------

export async function reactivateUser(userId: string): Promise<TeamActionResult> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError || !user) {
    return { success: false, error: authError ?? "Not authenticated." };
  }

  const { data, error } = await supabase
    .from("users")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id, email, name, role, is_active, last_login_at, created_at")
    .single<TeamMemberRow>();

  if (error) {
    return {
      success: false,
      error: `Failed to reactivate user: ${error.message}`,
    };
  }

  return { success: true, member: data };
}

// ---------------------------------------------------------------------------
// inviteTeamMember
// Sends a Supabase magic-link invitation email via the admin API.
// The invited user's role is embedded in the invitation metadata so that
// the profile row (created by Supabase's handle_new_user trigger or on first
// login) can be seeded with the correct role.
// ---------------------------------------------------------------------------

export async function inviteTeamMember(
  email: string,
  role: UserRole,
  name?: string,
): Promise<TeamActionResult> {
  const { user, error: authError } = await requireAdmin();
  if (authError || !user) {
    return { success: false, error: authError ?? "Not authenticated." };
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { success: false, error: "A valid email address is required." };
  }

  if (!["admin", "analyst", "read_only"].includes(role)) {
    return { success: false, error: "Invalid role value." };
  }

  // Use the service-role client — inviteUserByEmail requires admin privileges
  let serviceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return {
      success: false,
      error:
        "Service role key is not configured. " +
        "Set SUPABASE_SERVICE_ROLE_KEY in your environment variables.",
    };
  }

  const { data: inviteData, error: inviteError } =
    await serviceClient.auth.admin.inviteUserByEmail(trimmedEmail, {
      data: {
        role,
        name: name?.trim() ?? null,
      },
    });

  if (inviteError) {
    return {
      success: false,
      error: `Failed to send invitation: ${inviteError.message}`,
    };
  }

  // Upsert the profile row so the role is applied immediately, even before
  // the user clicks the magic link.  The RLS "users can insert own profile"
  // policy won't allow this insert (different uid), so we reuse the
  // service-role client which bypasses RLS.
  if (inviteData.user) {
    await serviceClient.from("users").upsert(
      {
        id: inviteData.user.id,
        email: trimmedEmail,
        name: name?.trim() ?? null,
        role,
        is_active: true,
      },
      { onConflict: "id", ignoreDuplicates: false },
    );
  }

  return { success: true };
}
