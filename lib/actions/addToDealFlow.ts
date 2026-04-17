"use server";

/**
 * addToDealFlow — Next.js Server Action
 *
 * Creates a new pipeline deal in the `deals` table pre-populated with data
 * from a PROCEED IST screening (PRD §8.1).
 *
 * The DealFlow platform shares the same Supabase instance as the IST Screener,
 * so this is a direct insert (no external API call required).
 *
 * @returns The UUID of the newly created deal row.
 * @throws  When the Supabase insert fails or the screening does not have a
 *          PROCEED recommendation.
 */

import { createClient } from "../supabase/server";

export interface AddToDealFlowInput {
  /** Company name extracted from the IST analysis. */
  companyName: string;
  /**
   * Business sector / industry (free-text, nullable when not determinable).
   * Sourced from the company overview section of the IST snapshot.
   */
  sector?: string | null;
  /**
   * Revenue figure as a human-readable string (e.g. "$85M").
   * Nullable when no revenue data was extracted.
   */
  revenue?: string | null;
  /**
   * EBITDA figure as a human-readable string (e.g. "$12M" or "14% margin").
   * Nullable when no EBITDA data was extracted.
   */
  ebitda?: string | null;
  /** Geographic location of the target business. Nullable when not available. */
  location?: string | null;
  /** Deal origination channel (e.g. "Banker", "Proprietary"). */
  dealSource?: string | null;
  /** Deal type track — 'traditional_pe' or 'ip_technology'. */
  dealType?: "traditional_pe" | "ip_technology" | null;
  /** UUID of the originating IST screening record. */
  istScreeningId: string;
  /** UUID of the authenticated user creating the deal. */
  userId: string;
}

export async function addToDealFlow(
  input: AddToDealFlowInput,
): Promise<string> {
  const supabase = await createClient();

  const {
    companyName,
    sector,
    revenue,
    ebitda,
    location,
    dealSource,
    dealType,
    istScreeningId,
    userId,
  } = input;

  const { data, error } = await supabase
    .from("deals")
    .insert({
      company_name: companyName,
      sector: sector ?? null,
      revenue: revenue ?? null,
      ebitda: ebitda ?? null,
      location: location ?? null,
      deal_source: dealSource ?? null,
      deal_type: dealType ?? null,
      ist_screening_id: istScreeningId,
      created_by: userId,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to add deal to DealFlow: ${error.message}`);
  }

  return data.id as string;
}
