"use server";

/**
 * updateActualOutcome — Next.js Server Action
 *
 * Records the firm's real-world decision for a screening record (PRD §8.4).
 * The `actual_outcome` field enables reporting on how often the AI's
 * recommendation aligned with what the firm actually did.
 *
 * RLS: only the screening creator or an admin may update a screening row,
 * so this action is implicitly scoped to the authenticated user.
 */

import { createClient } from "../supabase/server";

export type ActualOutcome =
  | "pursued"
  | "passed"
  | "invested"
  | "currently_in_diligence"
  | "exited";

export const ACTUAL_OUTCOME_LABELS: Record<ActualOutcome, string> = {
  pursued: "Pursued",
  passed: "Passed",
  invested: "Invested",
  currently_in_diligence: "Currently in Diligence",
  exited: "Exited",
};

export async function updateActualOutcome(
  screeningId: string,
  outcome: ActualOutcome | null,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("screenings")
    .update({ actual_outcome: outcome })
    .eq("id", screeningId);

  if (error) {
    throw new Error(`Failed to update actual outcome: ${error.message}`);
  }
}
