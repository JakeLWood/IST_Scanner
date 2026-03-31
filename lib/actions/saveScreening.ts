"use server";

/**
 * saveScreening — Next.js Server Action
 *
 * Persists a completed IST analysis to the `screenings` Supabase table.
 *
 * Responsibilities:
 *  1. Compute the composite score and recommendation via the scoring engine.
 *  2. Insert a new row that stores `raw_document_text`, `ai_response_json`,
 *     `scores_json`, and `snapshot_json` in the correct columns.
 *  3. Return the new screening UUID so the caller can redirect to it.
 */

import { createClient } from "../supabase/server";
import { computeCompositeScore } from "../scoringEngine";
import type { ISTAnalysis, ScreeningMetadata } from "../../types/ist";

/**
 * Saves a completed IST analysis to Supabase and returns the new screening ID.
 *
 * @param analysis  - Full Claude analysis conforming to `ISTAnalysis` (PRD §5.4).
 * @param rawText   - Raw text extracted from the uploaded document.
 * @param userId    - UUID of the authenticated user creating the screening.
 * @param metadata  - Optional caller-supplied context (deal source, notes, etc.).
 *                    Defaults to an empty object when omitted.
 *
 * @returns The UUID of the newly created screening row.
 * @throws  When the Supabase insert fails.
 */
export async function saveScreening(
  analysis: ISTAnalysis,
  rawText: string,
  userId: string,
  metadata: ScreeningMetadata = {},
): Promise<string> {
  const supabase = await createClient();

  // ------------------------------------------------------------------
  // 1. Generate composite score and recommendation via the scoring engine
  // ------------------------------------------------------------------
  const { compositeScore, recommendation } = computeCompositeScore(
    analysis.scores,
  );

  // ------------------------------------------------------------------
  // 2. Resolve company name — prefer caller override over extracted name
  // ------------------------------------------------------------------
  const overrideName = metadata.dealNameOverride?.trim();
  const companyName = overrideName ? overrideName : analysis.company_name;

  // ------------------------------------------------------------------
  // 3. Persist the screening record
  // ------------------------------------------------------------------
  const { data, error } = await supabase
    .from("screenings")
    .insert({
      user_id: userId,
      company_name: companyName,
      deal_type: analysis.deal_type,
      deal_source: metadata.dealSource ?? null,
      composite_score: compositeScore,
      recommendation,
      raw_document_text: rawText,
      ai_response_json: analysis,
      scores_json: analysis.scores,
      snapshot_json: analysis.snapshot,
      notes: metadata.notes ?? null,
      is_disqualified: false,
      disqualifier_ids: [],
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to save screening: ${error.message}`);
  }

  return data.id as string;
}
