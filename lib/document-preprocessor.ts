/**
 * Document Preprocessor
 *
 * Utility functions for detecting and handling edge cases in deal documents
 * before they are submitted to the AI analysis engine.
 *
 * Implements PRD Section 9.3 edge case handling:
 *   1. Very short documents (< 200 words)
 *   2. Very long documents (50+ pages / > MAX_DOCUMENT_CHARS characters)
 *   3. Non-English documents
 *   6. Highly redacted documents
 */

// ---------------------------------------------------------------------------
// Edge Case 1: Very Short Document
// ---------------------------------------------------------------------------

/** Minimum word count for a document to be considered substantive (PRD §9.3). */
export const MIN_WORD_COUNT = 200;

/** Result of analyzing document length. */
export interface DocumentLengthAnalysis {
  /** Approximate word count of the document. */
  wordCount: number;
  /** True when the document contains fewer than {@link MIN_WORD_COUNT} words. */
  isShortDocument: boolean;
  /** Human-readable warning message present when `isShortDocument` is true. */
  warning?: string;
}

/**
 * Counts the approximate number of words in a text string.
 *
 * Words are defined as any sequence of non-whitespace characters separated
 * by one or more whitespace characters.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Analyzes document length and flags very short documents (PRD §9.3 edge case 1).
 *
 * @param text - Extracted document text.
 * @returns Analysis result with word count and a flag/warning for short docs.
 */
export function analyzeDocumentLength(text: string): DocumentLengthAnalysis {
  const wordCount = countWords(text);
  const isShortDocument = wordCount < MIN_WORD_COUNT;

  return {
    wordCount,
    isShortDocument,
    warning: isShortDocument
      ? `Document contains only ${wordCount} word${wordCount === 1 ? "" : "s"} (minimum recommended: ${MIN_WORD_COUNT}). ` +
        "Analysis will be limited and low-confidence due to insufficient data."
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Edge Case 2: Very Long Document
// ---------------------------------------------------------------------------

/**
 * Maximum character count before a document is considered too long for the
 * AI context window (PRD §9.3 edge case 2).
 *
 * Rationale: claude-sonnet has a ~200K token context window; at ~4 chars/token
 * that is roughly 800K characters.  We use 120K characters (~30,000 words /
 * ~50 pages) as the practical limit so the prompt, system message, and JSON
 * response also fit comfortably within the window.
 */
export const MAX_DOCUMENT_CHARS = 120_000;

/** Result of truncating a document for the AI context window. */
export interface TruncationResult {
  /** The (possibly truncated) text ready to send to the AI. */
  text: string;
  /** True when the document was actually truncated. */
  wasTruncated: boolean;
  /** Character count of the original document. */
  originalCharCount: number;
  /** Character count after truncation (equal to `originalCharCount` when not truncated). */
  truncatedCharCount: number;
  /** Human-readable warning message present when `wasTruncated` is true. */
  warning?: string;
}

/**
 * Truncates a document intelligently to fit within the AI context window
 * (PRD §9.3 edge case 2).
 *
 * Truncation strategy (PRD: "prioritize executive summary, financials, and
 * risk factors"):
 *  - Allocate 70 % of the budget to the beginning of the document (executive
 *    summary, company overview, financials usually appear early).
 *  - Allocate 30 % of the budget to the end of the document (risk factors,
 *    deal terms, and appendices usually appear last).
 *  - Insert a prominent truncation notice between the two halves.
 *
 * @param text    - Full extracted document text.
 * @param maxChars - Maximum character count (defaults to {@link MAX_DOCUMENT_CHARS}).
 * @returns Truncation result with the (possibly shortened) text and metadata.
 */
export function truncateForContext(
  text: string,
  maxChars: number = MAX_DOCUMENT_CHARS,
): TruncationResult {
  const originalCharCount = text.length;

  if (originalCharCount <= maxChars) {
    return {
      text,
      wasTruncated: false,
      originalCharCount,
      truncatedCharCount: originalCharCount,
    };
  }

  // Allocate 70 % to the head (exec summary / financials) and 30 % to the tail
  // (risk factors / deal terms).
  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = maxChars - headChars;

  const head = text.slice(0, headChars);
  const tail = text.slice(text.length - tailChars);

  const truncationNotice =
    `\n\n[... DOCUMENT TRUNCATED — The original document was ` +
    `${Math.round(originalCharCount / 1000)}K characters. ` +
    `The middle section has been omitted to fit within the AI context window. ` +
    `Analysis prioritizes the executive summary, financial data, and risk factors. ...]\n\n`;

  const truncated = head + truncationNotice + tail;

  return {
    text: truncated,
    wasTruncated: true,
    originalCharCount,
    truncatedCharCount: truncated.length,
    warning:
      `Document was truncated from ${Math.round(originalCharCount / 1000)}K to ` +
      `${Math.round(truncated.length / 1000)}K characters. ` +
      "Analysis is based on the document beginning and end; the middle section was omitted.",
  };
}

// ---------------------------------------------------------------------------
// Edge Case 3: Non-English Document
// ---------------------------------------------------------------------------

/** Result of language detection. */
export interface LanguageDetectionResult {
  /**
   * True when the document is likely English or a Latin-script language.
   * False when a significant portion of characters are non-Latin (e.g.,
   * Arabic, Chinese, Cyrillic, Japanese, Korean, etc.).
   */
  isEnglish: boolean;
  /**
   * Fraction of letter characters that fall outside the Latin Extended-B
   * Unicode block (U+0041–U+024F).  A value above 0.15 triggers the warning.
   */
  nonLatinRatio: number;
  /** Human-readable warning message present when `isEnglish` is false. */
  warning?: string;
}

/**
 * Detects whether a document is likely non-English by measuring the ratio of
 * non-Latin-script characters in a sample of the text (PRD §9.3 edge case 3).
 *
 * This is a lightweight heuristic — not a full language-detection library —
 * but reliably flags documents written primarily in non-Latin scripts
 * (Arabic, Chinese, Cyrillic, Japanese, Korean, etc.).
 *
 * Limitation: Latin-script non-English languages (French, Spanish, German,
 * Portuguese, etc.) will not be detected by this heuristic.  For the IST
 * Screener's primary use-case (U.S. deal flow), this is an acceptable
 * trade-off.
 *
 * @param text - Extracted document text.
 * @returns Detection result indicating whether the document appears to be English.
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { isEnglish: true, nonLatinRatio: 0 };
  }

  // Sample the first 2,000 characters for performance.
  const sample = trimmed.slice(0, 2_000);

  // Collect all Unicode letter characters.
  const letters = sample.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) {
    return { isEnglish: true, nonLatinRatio: 0 };
  }

  // Characters outside the Latin Extended-B block (U+024F) are non-Latin.
  const nonLatin = letters.filter((ch) => (ch.codePointAt(0) ?? 0) > 0x024f);
  const nonLatinRatio = nonLatin.length / letters.length;

  // Threshold: > 15 % non-Latin characters → flag as potentially non-English.
  const isEnglish = nonLatinRatio < 0.15;

  return {
    isEnglish,
    nonLatinRatio,
    warning: isEnglish
      ? undefined
      : `Document appears to contain significant non-English text ` +
        `(${Math.round(nonLatinRatio * 100)}% non-Latin characters). ` +
        "English documents are recommended for best analysis accuracy. " +
        "Proceeding with analysis; results may be less reliable.",
  };
}

// ---------------------------------------------------------------------------
// Edge Case 6: Highly Redacted Document
// ---------------------------------------------------------------------------

/** Qualitative density of redactions in a document. */
export type RedactionDensity = "none" | "low" | "moderate" | "high";

/** Result of analyzing document redactions. */
export interface RedactionAnalysis {
  /** True when the document has moderate or high redaction density. */
  hasSignificantRedactions: boolean;
  /** Total count of detected redaction markers. */
  redactionCount: number;
  /** Qualitative density classification. */
  density: RedactionDensity;
  /** Human-readable warning message present when `hasSignificantRedactions` is true. */
  warning?: string;
}

/**
 * Common redaction marker patterns found in legal and financial documents.
 *
 * Matches:
 *  - Explicit tags: [REDACTED], [REDACT], [WITHHELD], [REMOVED], [CONFIDENTIAL]
 *  - Block / fill characters: ████████
 *  - Three or more consecutive asterisks: ***
 *  - Five or more consecutive underscores: _____
 *  - Empty bracketed spans with spaces or asterisks: [   ], [***]
 */
const REDACTION_PATTERNS: RegExp[] = [
  /\[REDACTED?\]/gi,
  /\[WITHHELD\]/gi,
  /\[REMOVED\]/gi,
  /\[CONFIDENTIAL\]/gi,
  /█+/g,
  /\*{3,}/g,
  /_{5,}/g,
  /\[[\s*]{2,}\]/g,
];

/**
 * Analyzes a document for the presence and density of redaction markers
 * (PRD §9.3 edge case 6).
 *
 * @param text - Extracted document text.
 * @returns Redaction analysis with count, density, and a warning when significant.
 */
export function analyzeRedactions(text: string): RedactionAnalysis {
  let redactionCount = 0;
  for (const pattern of REDACTION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      redactionCount += matches.length;
    }
  }

  let density: RedactionDensity;
  if (redactionCount === 0) {
    density = "none";
  } else if (redactionCount < 5) {
    density = "low";
  } else if (redactionCount < 20) {
    density = "moderate";
  } else {
    density = "high";
  }

  const hasSignificantRedactions = density === "moderate" || density === "high";

  return {
    hasSignificantRedactions,
    redactionCount,
    density,
    warning: hasSignificantRedactions
      ? `Document contains ${redactionCount} redaction marker${redactionCount === 1 ? "" : "s"} ` +
        `(${density} density). Confidence in scoring dimensions affected by ` +
        "redacted data is reduced. Specific areas with impaired analysis are noted below."
      : undefined,
  };
}
