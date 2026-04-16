"use server";

/**
 * saveDisqualifier — Next.js Server Action
 *
 * Provides CRUD operations for the `disqualifiers` table.
 * Only admin users may call these actions; RLS on the table enforces this
 * at the database level as well (PRD §7.3).
 */

import { createClient } from "../supabase/server";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface DisqualifierRow {
  id: string;
  name: string;
  description: string | null;
  field: string;
  operator: string;
  value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DisqualifierInput {
  name: string;
  description: string;
  field: string;
  operator: string;
  value: string;
  is_active: boolean;
}

export interface DisqualifierResult {
  success: boolean;
  error?: string;
  disqualifier?: DisqualifierRow;
}

// ---------------------------------------------------------------------------
// Auth helper
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
    .single();

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
// createDisqualifier
// ---------------------------------------------------------------------------

export async function createDisqualifier(
  input: DisqualifierInput,
): Promise<DisqualifierResult> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError || !user) return { success: false, error: authError ?? "Not authenticated." };

  const { name, description, field, operator, value, is_active } = input;

  if (!name.trim()) return { success: false, error: "Name is required." };
  if (!field.trim()) return { success: false, error: "Field is required." };
  if (!operator.trim()) return { success: false, error: "Operator is required." };
  if (!value.trim()) return { success: false, error: "Value is required." };

  const { data, error } = await supabase
    .from("disqualifiers")
    .insert({
      name: name.trim(),
      description: description.trim() || null,
      field: field.trim(),
      operator: operator.trim(),
      value: value.trim(),
      is_active,
      created_by: user.id,
    })
    .select()
    .single<DisqualifierRow>();

  if (error) {
    return { success: false, error: `Failed to create disqualifier: ${error.message}` };
  }

  return { success: true, disqualifier: data };
}

// ---------------------------------------------------------------------------
// updateDisqualifier
// ---------------------------------------------------------------------------

export async function updateDisqualifier(
  id: string,
  input: DisqualifierInput,
): Promise<DisqualifierResult> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError || !user) return { success: false, error: authError ?? "Not authenticated." };

  const { name, description, field, operator, value, is_active } = input;

  if (!name.trim()) return { success: false, error: "Name is required." };
  if (!field.trim()) return { success: false, error: "Field is required." };
  if (!operator.trim()) return { success: false, error: "Operator is required." };
  if (!value.trim()) return { success: false, error: "Value is required." };

  const { data, error } = await supabase
    .from("disqualifiers")
    .update({
      name: name.trim(),
      description: description.trim() || null,
      field: field.trim(),
      operator: operator.trim(),
      value: value.trim(),
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single<DisqualifierRow>();

  if (error) {
    return { success: false, error: `Failed to update disqualifier: ${error.message}` };
  }

  return { success: true, disqualifier: data };
}

// ---------------------------------------------------------------------------
// toggleDisqualifier
// ---------------------------------------------------------------------------

export async function toggleDisqualifier(
  id: string,
  is_active: boolean,
): Promise<DisqualifierResult> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError || !user) return { success: false, error: authError ?? "Not authenticated." };

  const { data, error } = await supabase
    .from("disqualifiers")
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single<DisqualifierRow>();

  if (error) {
    return { success: false, error: `Failed to toggle disqualifier: ${error.message}` };
  }

  return { success: true, disqualifier: data };
}

// ---------------------------------------------------------------------------
// deleteDisqualifier
// ---------------------------------------------------------------------------

export async function deleteDisqualifier(id: string): Promise<DisqualifierResult> {
  const { supabase, user, error: authError } = await requireAdmin();
  if (authError || !user) return { success: false, error: authError ?? "Not authenticated." };

  const { error } = await supabase.from("disqualifiers").delete().eq("id", id);

  if (error) {
    return { success: false, error: `Failed to delete disqualifier: ${error.message}` };
  }

  return { success: true };
}
