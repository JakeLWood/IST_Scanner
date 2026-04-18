/**
 * analyzeDocument — Node.js-compatible IST analysis helper
 *
 * Calls the Anthropic Claude API directly (without the Supabase Edge Function)
 * and returns a validated ISTAnalysis. Designed for use in Next.js Route
 * Handlers (e.g. the email intake webhook) where a user JWT is not available.
 *
 * Classification is performed first with a lightweight Claude call; the full
 * IST analysis follows using the appropriate track prompt.
 */

import type { ISTAnalysis } from "../../types/ist-analysis";
import {
  TRADITIONAL_PE_SYSTEM_PROMPT,
  buildTraditionalPEAnalysisPrompt,
} from "../prompts/traditional-pe-analysis";
import {
  IP_TECH_SYSTEM_PROMPT,
  buildIPTechAnalysisPrompt,
} from "../prompts/ip-tech-commercialization-analysis";
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationPrompt,
} from "../prompts/classify-deal-type";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-5-20250929";
/** Characters above this limit are truncated before sending to Claude. */
const MAX_CHARS = 180_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function truncate(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS);
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

type AnthropicContentBlock = AnthropicTextBlock | { type: string };

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
}

async function callClaude(
  apiKey: string,
  system: string,
  userMessage: string,
  maxTokens = 8192,
): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  const textBlocks = data.content.filter(
    (b): b is AnthropicTextBlock => b.type === "text",
  );
  return textBlocks.map((b) => b.text).join("");
}

// ---------------------------------------------------------------------------
// Deal-type classification
// ---------------------------------------------------------------------------

type DealType = "traditional_pe" | "ip_technology";

interface ClassificationResult {
  deal_type: DealType;
  confidence: number;
  reasoning: string;
}

async function classifyDealType(
  apiKey: string,
  text: string,
): Promise<DealType> {
  try {
    const raw = await callClaude(
      apiKey,
      CLASSIFICATION_SYSTEM_PROMPT,
      buildClassificationPrompt(text),
      512,
    );
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const result = JSON.parse(cleaned) as ClassificationResult;
    if (
      result.deal_type === "traditional_pe" ||
      result.deal_type === "ip_technology"
    ) {
      return result.deal_type;
    }
  } catch (err) {
    console.error("[analyzeDocument] classification failed, defaulting to traditional_pe:", err);
  }
  return "traditional_pe";
}

// ---------------------------------------------------------------------------
// IST analysis
// ---------------------------------------------------------------------------

function parseAnalysis(raw: string): ISTAnalysis {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned) as ISTAnalysis;
}

export interface AnalyzeDocumentResult {
  analysis: ISTAnalysis;
  dealType: DealType;
}

/**
 * Runs the full IST analysis pipeline on plain text extracted from a deal
 * document. This function is intentionally self-contained — it performs its
 * own deal-type classification then calls Claude for the full IST analysis.
 *
 * @param extractedText - Raw text extracted from the deal document(s).
 * @returns The validated {@link ISTAnalysis} and the detected deal type.
 * @throws When `ANTHROPIC_API_KEY` is not configured or the Claude call fails.
 */
export async function analyzeDocument(
  extractedText: string,
): Promise<AnalyzeDocumentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Set it in your environment variables.",
    );
  }

  const safeText = truncate(extractedText.trim());
  const analysisDate = new Date().toISOString().slice(0, 10);

  // 1. Classify deal type
  const dealType = await classifyDealType(apiKey, safeText);

  // 2. Build the appropriate analysis prompt
  const systemPrompt =
    dealType === "traditional_pe"
      ? TRADITIONAL_PE_SYSTEM_PROMPT
      : IP_TECH_SYSTEM_PROMPT;
  const analysisPrompt =
    dealType === "traditional_pe"
      ? buildTraditionalPEAnalysisPrompt(safeText, analysisDate)
      : buildIPTechAnalysisPrompt(safeText, analysisDate);

  // 3. Run the full IST analysis
  const raw = await callClaude(apiKey, systemPrompt, analysisPrompt);
  const analysis = parseAnalysis(raw);

  return { analysis, dealType };
}
