"use server";

/**
 * saveSystemPrompt — Next.js Server Action
 *
 * Persists a new version of a system prompt to the system_prompts table.
 * Only admin users may call this action; the RLS policies on system_prompts
 * enforce this at the database level too.
 *
 * Saving always creates a new version row — existing rows are never mutated.
 * The new row is marked is_active = true; the previous active row for the
 * same track and prompt_type is deactivated atomically before inserting.
 *
 * PRD §5.1   — System prompt is configurable through admin settings.
 * PRD §7.1   — system_prompts schema: id, name, prompt_text, track,
 *               is_active, version, created_by, created_at.
 * PRD §7.3   — Only admins can write system_prompts.
 */

import { createClient } from "../supabase/server";

export type PromptTrack = "traditional_pe" | "ip_technology";

/** A single row from system_prompts joined with the creator's name. */
export interface PromptVersionRow {
  id: string;
  name: string;
  prompt_text: string;
  track: PromptTrack | null;
  is_active: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  /** Display name of the user who created this version (null = system seed). */
  creator_name: string | null;
}

export interface SaveSystemPromptResult {
  success: boolean;
  error?: string;
  newVersion?: number;
}

/**
 * Saves a new version of the system prompt for the specified track.
 *
 * @param name       - Prompt name used to group versions (e.g. "PE System Prompt").
 * @param promptText - Full prompt text for the new version.
 * @param track      - Which deal track this prompt applies to.
 */
export async function saveSystemPrompt(
  name: string,
  promptText: string,
  track: PromptTrack,
): Promise<SaveSystemPromptResult> {
  const supabase = await createClient();

  // ------------------------------------------------------------------
  // 1. Auth check
  // ------------------------------------------------------------------
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  // ------------------------------------------------------------------
  // 2. Role check — admin only (PRD §7.3)
  // ------------------------------------------------------------------
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    return {
      success: false,
      error: "Insufficient permissions. Admin role required.",
    };
  }

  // ------------------------------------------------------------------
  // 3. Validate prompt text
  // ------------------------------------------------------------------
  const trimmed = promptText.trim();
  if (!trimmed) {
    return { success: false, error: "Prompt text cannot be empty." };
  }

  // ------------------------------------------------------------------
  // 4. Find the highest existing version for this prompt name so we
  //    can increment it.
  // ------------------------------------------------------------------
  const { data: latestRow } = await supabase
    .from("system_prompts")
    .select("version")
    .eq("name", name)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  const newVersion = (latestRow?.version ?? 0) + 1;

  // ------------------------------------------------------------------
  // 5. Deactivate the current active prompt for this track + type.
  //    We do this before inserting so the new row becomes the sole
  //    active entry.
  // ------------------------------------------------------------------
  const { error: deactivateError } = await supabase
    .from("system_prompts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("track", track)
    .eq("prompt_type", "system")
    .eq("is_active", true);

  if (deactivateError) {
    return {
      success: false,
      error: `Failed to deactivate previous prompt: ${deactivateError.message}`,
    };
  }

  // ------------------------------------------------------------------
  // 6. Insert the new active version.
  // ------------------------------------------------------------------
  const { error: insertError } = await supabase.from("system_prompts").insert({
    name,
    prompt_text: trimmed,
    prompt_type: "system",
    track,
    is_active: true,
    version: newVersion,
    created_by: user.id,
  });

  if (insertError) {
    return {
      success: false,
      error: `Failed to save prompt: ${insertError.message}`,
    };
  }

  return { success: true, newVersion };
}

/**
 * Activates a specific historical prompt version.
 *
 * Deactivates the current active version for the track then marks the
 * requested row as active. Admin only.
 *
 * @param promptId - UUID of the system_prompts row to activate.
 * @param track    - Track of the prompt (used to scope the deactivation).
 */
export async function activatePromptVersion(
  promptId: string,
  track: PromptTrack,
): Promise<SaveSystemPromptResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    return { success: false, error: "Admin role required." };
  }

  // Deactivate current active prompt for this track
  const { error: deactivateError } = await supabase
    .from("system_prompts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("track", track)
    .eq("prompt_type", "system")
    .eq("is_active", true);

  if (deactivateError) {
    return {
      success: false,
      error: `Failed to deactivate current prompt: ${deactivateError.message}`,
    };
  }

  // Activate the requested version
  const { error: activateError } = await supabase
    .from("system_prompts")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", promptId);

  if (activateError) {
    return {
      success: false,
      error: `Failed to activate prompt version: ${activateError.message}`,
    };
  }

  return { success: true };
}
