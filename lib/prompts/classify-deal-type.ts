/**
 * Deal-Type Classification Prompts
 *
 * Used to classify deal documents into a track before routing to the
 * appropriate analysis prompt (e.g., Traditional PE, Growth Equity, etc.).
 *
 * Exports:
 *   CLASSIFICATION_SYSTEM_PROMPT        – system role prompt
 *   buildClassificationPrompt()         – user role prompt factory
 *   DealTypeClassificationResult        – typed result interface
 */

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type DealType =
  | "traditional_pe"
  | "growth_equity"
  | "venture"
  | "real_estate"
  | "credit"
  | "unknown";

export interface DealTypeClassificationResult {
  dealType: DealType;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const CLASSIFICATION_SYSTEM_PROMPT = `\
You are a deal-classification assistant at Catalyze Partners, a middle-market private \
equity firm. Your sole task is to read excerpts from deal documents and classify the \
transaction into the most appropriate deal-type track.

Available tracks:
  traditional_pe  – Mature, cash-flow-positive businesses targeted for LBO / buyout
  growth_equity   – High-growth companies seeking minority or majority growth capital
  venture         – Early-stage startups, typically pre-profitability
  real_estate     – Real-property assets, REITs, or real-estate-focused operating companies
  credit          – Debt-oriented investments (direct lending, distressed, structured credit)
  unknown         – Insufficient information to classify

Return ONLY the JSON object matching DealTypeClassificationResult. No markdown or prose.
`;

// ---------------------------------------------------------------------------
// Prompt factory
// ---------------------------------------------------------------------------

/**
 * Builds the user-role prompt for deal-type classification.
 *
 * @param extractedText - Raw text extracted from the deal documents
 * @returns Prompt string to pass as the `user` message to Claude
 */
export function buildClassificationPrompt(extractedText: string): string {
  return `\
Classify the following deal materials into one of the available deal-type tracks and \
return a single JSON object matching this interface:

{
  "dealType":   "traditional_pe" | "growth_equity" | "venture" | "real_estate" | "credit" | "unknown",
  "confidence": "high" | "medium" | "low",
  "reasoning":  string   // 1–2 sentences explaining the classification
}

=== Deal Materials ===
${extractedText}
=== End of Deal Materials ===

Return ONLY the JSON object. No markdown, no prose, no code fences.
`;
}
