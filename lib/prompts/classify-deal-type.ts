/**
 * IST Scanner — Deal Type Classification Prompt
 *
 * Provides the system prompt and user-message builder used to classify an
 * inbound deal document as either a Traditional PE opportunity or an
 * IP / Technology Commercialisation opportunity.
 *
 * Classification runs as a lightweight pre-pass before the full IST analysis
 * (PRD §2.3 Step 3).  The result determines which scoring framework Claude
 * applies during the main analysis step.
 *
 * Reference: IST Screener PRD §4.3 — Deal Type Classification
 */

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

/**
 * The JSON object that Claude returns after classifying a deal document.
 *
 * The caller should parse the raw completion text with `JSON.parse` and
 * validate it against this interface before using it downstream.
 */
export interface DealTypeClassificationResult {
  /**
   * The determined category of the deal.
   * - `'traditional_pe'`  – operating company acquired as a going concern
   * - `'ip_technology'`   – technology / IP asset requiring commercialisation
   */
  deal_type: 'traditional_pe' | 'ip_technology';

  /**
   * Confidence in the classification expressed as a probability (0.0 – 1.0).
   * Values at or above 0.9 indicate unambiguous, multi-signal evidence.
   * Values below 0.7 suggest the document is thin or ambiguous and a human
   * review of the classification is recommended before proceeding.
   */
  confidence: number;

  /**
   * 1–3 sentence explanation of why this classification was chosen, citing
   * the specific signals found in the document.
   */
  reasoning: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * System prompt that establishes Claude's identity and classification task.
 *
 * Send this string as the `system` parameter in the Anthropic Messages API
 * request.  It should not be modified at call-time; use
 * {@link buildClassificationPrompt} to supply the document text.
 *
 * The heuristics table below is taken verbatim from PRD §4.3.
 */
export const CLASSIFICATION_SYSTEM_PROMPT = `You are a senior Private Equity associate at Catalyze Partners, a firm that acquires and commercializes advanced technologies and lower middle market operating companies.

Your task is to read an inbound deal document and classify it into exactly one of two categories before a full Investment Screening Test (IST) is conducted:

1. **traditional_pe** – The document describes an operating company that generates revenue and cash flow in the conventional sense. Catalyze would acquire it as a going-concern lower-middle-market business and apply its operational playbook.

2. **ip_technology** – The document describes a technology asset, patent portfolio, or IP-rich division that requires commercialisation or licensing rather than straightforward operational management.

## Classification heuristics (PRD §4.3)

Apply every rule below to the document. Each signal pushes toward one category. Weigh all signals together and select the category supported by the strongest evidence.

| Signal present in the document | Classification |
|---|---|
| Describes an **operating company with existing revenue and positive cash flow** | → traditional_pe |
| Describes a **technology, patent portfolio, or IP asset being divested or licensed** | → ip_technology |
| References a **Fortune 100 parent company spinning out or divesting a division** | → ip_technology |
| Discusses **Technology Readiness Levels (TRL), prototypes, or R&D programmes** | → ip_technology |
| Presents a **CIM-style financial profile with three or more years of historical financials** | → traditional_pe |

**Tie-breaking rule:** When signals conflict (e.g. an operating company that also holds significant IP), classify based on the *primary value driver* described in the document and note the hybrid nature in the \`reasoning\` field.

## Analytical philosophy

- Be rigorous and skeptical. Do not infer signals that are not clearly present in the document.
- Distinguish between facts stated in the document and your own inferences.
- If the document is extremely thin or ambiguous, default to \`"traditional_pe"\` with a confidence of \`0.5\` and explain the ambiguity in \`reasoning\`.

## Output format

Return **only** a valid JSON object — no surrounding prose, markdown fences, or explanation. The object must conform exactly to the following schema:

{
  "deal_type": "traditional_pe" | "ip_technology",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<1–3 sentences citing the specific signals from the document that drove this classification>"
}

Confidence scale:
- 0.90 – 1.00 : Unambiguous evidence; multiple signals all point to the same category.
- 0.70 – 0.89 : Clear primary signals with minor conflicting indicators.
- 0.50 – 0.69 : Document is ambiguous or lacks sufficient detail; classification is a best estimate.
- Do not return a confidence value below 0.50.`;

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

/**
 * Builds the user-turn message for the classification API call.
 *
 * @param extractedText - Raw text extracted from the deal document
 *                        (PDF / DOCX / PPTX).  The caller is responsible for
 *                        truncating overly long documents before passing them
 *                        here if necessary.
 * @returns The string to send as the `content` of the Anthropic user message.
 *
 * @example
 * ```ts
 * const response = await anthropic.messages.create({
 *   model: 'claude-sonnet-4-5-20250929',
 *   max_tokens: 256,
 *   system: CLASSIFICATION_SYSTEM_PROMPT,
 *   messages: [
 *     { role: 'user', content: buildClassificationPrompt(extractedText) },
 *   ],
 * });
 * const result: DealTypeClassificationResult = JSON.parse(
 *   response.content[0].type === 'text' ? response.content[0].text : '',
 * );
 * ```
 */
export function buildClassificationPrompt(extractedText: string): string {
  return `Classify the following deal document according to your instructions.

<document>
${extractedText}
</document>

Return only the JSON classification object.`;
}
