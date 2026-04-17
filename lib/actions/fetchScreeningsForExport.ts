"use server";

/**
 * fetchScreeningsForExport — Server Action
 *
 * Accepts an array of screening IDs and returns the full ISTAnalysis and
 * ScoringResult for each one. Used by the bulk export feature on the Deal Log
 * page (PRD §6.2.3).
 */

import { createClient } from "@/lib/supabase/server";
import type { ISTAnalysis } from "@/types/ist-analysis";
import type { ScoringResult } from "@/lib/scoringEngine";
import { DEFAULT_WEIGHTS, scoreAnalysis } from "@/lib/scoringEngine";

export interface ExportScreeningRecord {
  id: string;
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  dealSource: string | null;
}

type ScreeningExportRow = {
  id: string;
  composite_score: number | null;
  recommendation: "PROCEED" | "FURTHER_REVIEW" | "PASS" | null;
  ai_response_json: ISTAnalysis | null;
  scores_json: ScoringResult | null;
  is_disqualified: boolean;
  deal_source: string | null;
};

export async function fetchScreeningsForExport(
  ids: string[]
): Promise<ExportScreeningRecord[]> {
  if (ids.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("screenings")
    .select(
      "id, composite_score, recommendation, ai_response_json, scores_json, is_disqualified, deal_source"
    )
    .in("id", ids)
    .returns<ScreeningExportRow[]>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to fetch screenings for export");
  }

  const results: ExportScreeningRecord[] = [];

  for (const row of data) {
    if (!row.ai_response_json) continue;

    const analysis = row.ai_response_json;

    let scoringResult: ScoringResult;
    if (row.scores_json && row.composite_score !== null) {
      scoringResult = {
        ...row.scores_json,
        compositeScore: row.composite_score,
        recommendation: row.recommendation ?? "FURTHER_REVIEW",
        isDisqualified: row.is_disqualified,
      };
    } else {
      scoringResult = scoreAnalysis(analysis, { weights: DEFAULT_WEIGHTS });
    }

    results.push({
      id: row.id,
      analysis,
      scoringResult,
      dealSource: row.deal_source,
    });
  }

  return results;
}
