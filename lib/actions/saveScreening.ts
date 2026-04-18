"use server";

/**
 * saveScreening — Next.js Server Action
 *
 * Persists a completed IST analysis to the `screenings` Supabase table.
 *
 * Responsibilities:
 *  1. Compute the composite score and recommendation via the scoring engine.
 *  2. Insert a new row that stores `raw_document_text`, `ai_response_json`,
 *     and `scores_json` in the correct columns.
 *  3. Insert a row into `screening_documents` with a SHA-256 content_hash of
 *     the raw text so future submissions of the same document are detected as
 *     duplicates by the analyze-deal edge function (PRD §2.4).
 *  4. Return the new screening UUID so the caller can redirect to it.
 */

import { createHash } from "crypto";
import { createClient } from "../supabase/server";
import { computeCompositeScore } from "../scoringEngine";
import type { ISTAnalysis } from "../../types/ist";
import type { ScreeningMetadata } from "../../types/ist";

/**
 * Saves a completed IST analysis to Supabase and returns the new screening ID.
 *
 * @param analysis  - Full Claude analysis conforming to `ISTAnalysis`
 *                    (the 7-section format returned by the analyze-deal edge function).
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
  const { compositeScore, recommendation } = computeCompositeScore(analysis.scores);

  // ------------------------------------------------------------------
  // 2. Resolve company name — prefer caller override over extracted name
  // ------------------------------------------------------------------
  const overrideName = metadata.dealNameOverride?.trim();
  const companyName = overrideName ? overrideName : analysis.company_name;

  // ------------------------------------------------------------------
  // 3. Persist the screening record
  // ------------------------------------------------------------------
  const isDisqualified =
    analysis.recommendation.disqualifying_factors !== null &&
    (analysis.recommendation.disqualifying_factors?.length ?? 0) > 0;

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
      notes: metadata.notes ?? null,
      is_disqualified: isDisqualified,
      disqualifier_ids: [],
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to save screening: ${error.message}`);
  }

  // ------------------------------------------------------------------
  // 4. Record the document hash in screening_documents for duplicate
  //    detection (PRD §2.4). Uses SHA-256 of the raw extracted text.
  //    This is best-effort — a failure here is non-fatal.
  // ------------------------------------------------------------------
  const contentHash = createHash("sha256").update(rawText, "utf8").digest("hex");

  // Sanitize company name for use as a filename: replace any character that is
  // not alphanumeric, hyphen, underscore, or space with an underscore.
  const safeFileName = companyName.replace(/[^a-zA-Z0-9 _-]/g, "_");

  const { error: docError } = await supabase
    .from("screening_documents")
    .insert({
      screening_id: data.id,
      file_name: `${safeFileName}.txt`,
      file_type: "extracted_text",
      storage_path: `text/extracted/${data.id}`,
      extracted_text: rawText,
      content_hash: contentHash,
    });

  if (docError) {
    console.error(
      "Failed to save screening_documents hash (non-fatal):",
      docError.message,
    );
  }

  return data.id as string;
}
