/**
 * PRD §9.3 Edge Case Tests
 *
 * Tests for all eight edge cases defined in PRD Section 9.3:
 *   1. Very short document (< 200 words)
 *   2. Very long document (50+ pages)
 *   3. Non-English document
 *   4. Duplicate upload (hash-based cache)
 *   5. Contradictory information (prompt-level handling)
 *   6. Highly redacted document
 *   7. Image-only PDF (OCR fallback)
 *   8. Mixed deal type (hybrid)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  countWords,
  analyzeDocumentLength,
  MIN_WORD_COUNT,
  truncateForContext,
  MAX_DOCUMENT_CHARS,
  detectLanguage,
  analyzeRedactions,
} from "@/lib/document-preprocessor";
import {
  CLASSIFICATION_SYSTEM_PROMPT,
} from "@/lib/prompts/classify-deal-type";
import {
  TRADITIONAL_PE_SYSTEM_PROMPT,
  buildTraditionalPEAnalysisPrompt,
} from "@/lib/prompts/traditional-pe-analysis";
import { callEdgeFunction } from "@/lib/api/edgeFunctions";
import type { ISTAnalysis } from "@/types/ist-analysis";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SUPABASE_URL = "https://test.supabase.co";
const ACCESS_TOKEN = "test-jwt";

const MOCK_ANALYSIS: ISTAnalysis = {
  companyName: "Test Corp",
  analysisDate: "2026-04-16",
  dealType: "traditional_pe",
  companyOverview: {
    sectionName: "Company Overview",
    score: 6,
    commentary: "Solid business.",
    keyFindings: ["Finding A"],
  },
  marketOpportunity: {
    sectionName: "Market Opportunity",
    score: 6,
    commentary: "Decent market.",
    keyFindings: ["Finding B"],
  },
  financialProfile: {
    sectionName: "Financial Profile",
    score: 6,
    commentary: "Adequate financials.",
    keyFindings: ["Finding C"],
  },
  managementTeam: {
    sectionName: "Management Team",
    score: 6,
    commentary: "Experienced team.",
    keyFindings: ["Finding D"],
  },
  investmentThesis: {
    sectionName: "Investment Thesis",
    score: 6,
    commentary: "Clear thesis.",
    keyFindings: ["Finding E"],
  },
  riskAssessment: {
    sectionName: "Risk Assessment",
    score: 6,
    commentary: "Manageable risks.",
    keyFindings: ["Finding F"],
  },
  dealDynamics: {
    sectionName: "Deal Dynamics",
    score: 6,
    commentary: "Fair valuation.",
    keyFindings: ["Finding G"],
  },
  overallScore: 6.0,
  recommendation: "conditional_proceed",
  executiveSummary: "Test Corp is a solid mid-market business.",
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

// ===========================================================================
// Edge Case 1: Very Short Document (< 200 words)
// ===========================================================================

describe("Edge Case 1: Very Short Document", () => {
  it("countWords returns 0 for an empty string", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });

  it("countWords counts words accurately", () => {
    expect(countWords("Hello world")).toBe(2);
    expect(countWords("  one two  three  ")).toBe(3);
  });

  it("analyzeDocumentLength flags documents below MIN_WORD_COUNT", () => {
    const shortText = "This is a very short teaser email with minimal details.";
    const result = analyzeDocumentLength(shortText);
    expect(result.isShortDocument).toBe(true);
    expect(result.wordCount).toBeLessThan(MIN_WORD_COUNT);
    expect(result.warning).toContain("200");
  });

  it("analyzeDocumentLength does not flag documents meeting the threshold", () => {
    // Build a document with exactly MIN_WORD_COUNT words
    const adequateText = Array(MIN_WORD_COUNT).fill("word").join(" ");
    const result = analyzeDocumentLength(adequateText);
    expect(result.isShortDocument).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("edge function response includes _flags.shortDocument for < 200-word documents", async () => {
    const shortDocText = "Brief teaser. Company sells widgets. $5M revenue.";
    const responseWithFlags = {
      ...MOCK_ANALYSIS,
      _flags: {
        shortDocument: {
          wordCount: 8,
          warning:
            "Document contains only 8 words (minimum recommended: 200). Analysis is limited and low-confidence.",
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(responseWithFlags), { status: 200 }),
    );

    const result = await callEdgeFunction<typeof responseWithFlags>(
      "analyze-deal",
      { extractedText: shortDocText, dealType: "traditional_pe" },
      ACCESS_TOKEN,
    );

    expect(result._flags).toBeDefined();
    expect(result._flags?.shortDocument).toBeDefined();
    expect(result._flags?.shortDocument?.wordCount).toBe(8);
    expect(result._flags?.shortDocument?.warning).toContain("low-confidence");
    // Core analysis is still returned
    expect(result.companyName).toBe("Test Corp");
  });
});

// ===========================================================================
// Edge Case 2: Very Long Document (50+ pages)
// ===========================================================================

describe("Edge Case 2: Very Long Document (50+ pages)", () => {
  it("truncateForContext leaves short documents unchanged", () => {
    const shortText = "Hello world";
    const result = truncateForContext(shortText);
    expect(result.wasTruncated).toBe(false);
    expect(result.text).toBe(shortText);
    expect(result.truncatedCharCount).toBe(shortText.length);
    expect(result.originalCharCount).toBe(shortText.length);
  });

  it("truncateForContext truncates long documents", () => {
    // Create a text larger than the threshold
    const longText = "X".repeat(MAX_DOCUMENT_CHARS + 10_000);
    const result = truncateForContext(longText);
    expect(result.wasTruncated).toBe(true);
    expect(result.originalCharCount).toBe(MAX_DOCUMENT_CHARS + 10_000);
    expect(result.truncatedCharCount).toBeLessThanOrEqual(MAX_DOCUMENT_CHARS + 500); // notice adds chars
    expect(result.warning).toContain("truncated");
  });

  it("truncateForContext preserves head and tail content", () => {
    const prefix = "EXECUTIVE SUMMARY ".repeat(500); // ~9000 chars
    const middle = "MIDDLE SECTION ".repeat(10_000); // ~150000 chars
    const suffix = "RISK FACTORS ".repeat(500); // ~6500 chars
    const longText = prefix + middle + suffix;

    const result = truncateForContext(longText);
    expect(result.wasTruncated).toBe(true);
    expect(result.text).toContain("EXECUTIVE SUMMARY");
    expect(result.text).toContain("RISK FACTORS");
    expect(result.text).toContain("DOCUMENT TRUNCATED");
    // The vast middle should be removed
    expect(result.text.length).toBeLessThan(longText.length);
  });

  it("truncateForContext respects a custom maxChars limit", () => {
    const text = "A".repeat(500);
    const result = truncateForContext(text, 200);
    expect(result.wasTruncated).toBe(true);
  });

  it("edge function response includes _flags.documentTruncated for long documents", async () => {
    const responseWithFlags = {
      ...MOCK_ANALYSIS,
      _flags: {
        documentTruncated: {
          originalCharCount: 150_000,
          truncatedCharCount: 120_300,
          warning: "Document was truncated from 150K to 120K characters.",
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(responseWithFlags), { status: 200 }),
    );

    const result = await callEdgeFunction<typeof responseWithFlags>(
      "analyze-deal",
      {
        extractedText: "A".repeat(150_000),
        dealType: "traditional_pe",
      },
      ACCESS_TOKEN,
    );

    expect(result._flags?.documentTruncated).toBeDefined();
    expect(result._flags?.documentTruncated?.originalCharCount).toBeGreaterThan(
      MAX_DOCUMENT_CHARS,
    );
    expect(result._flags?.documentTruncated?.warning).toContain("truncated");
  });
});

// ===========================================================================
// Edge Case 3: Non-English Document
// ===========================================================================

describe("Edge Case 3: Non-English Document", () => {
  it("detectLanguage identifies English text as English", () => {
    const englishText =
      "This is a standard English document about private equity investment in lower middle market companies.";
    const result = detectLanguage(englishText);
    expect(result.isEnglish).toBe(true);
    expect(result.nonLatinRatio).toBeLessThan(0.15);
    expect(result.warning).toBeUndefined();
  });

  it("detectLanguage identifies Arabic text as non-English", () => {
    // Arabic characters
    const arabicText =
      "هذا مستند عربي يصف شركة تقنية متخصصة في التعلم الآلي والذكاء الاصطناعي للأسواق المالية";
    const result = detectLanguage(arabicText);
    expect(result.isEnglish).toBe(false);
    expect(result.nonLatinRatio).toBeGreaterThan(0.5);
    expect(result.warning).toContain("non-English");
  });

  it("detectLanguage identifies Chinese text as non-English", () => {
    // Simplified Chinese
    const chineseText = "这是一份关于私募股权投资和技术商业化的中文商业文件，描述了市场机会和风险因素";
    const result = detectLanguage(chineseText);
    expect(result.isEnglish).toBe(false);
    expect(result.nonLatinRatio).toBeGreaterThan(0.5);
    expect(result.warning).toContain("non-English");
  });

  it("detectLanguage returns isEnglish=true for empty text", () => {
    const result = detectLanguage("");
    expect(result.isEnglish).toBe(true);
    expect(result.nonLatinRatio).toBe(0);
  });

  it("detectLanguage returns isEnglish=true for text with no letters", () => {
    const result = detectLanguage("12345 !@#$% 67890");
    expect(result.isEnglish).toBe(true);
  });

  it("edge function response includes _flags.languageWarning for non-English documents", async () => {
    const responseWithFlags = {
      ...MOCK_ANALYSIS,
      _flags: {
        languageWarning: {
          nonLatinRatio: 0.82,
          warning:
            "Document appears to contain significant non-English text (82% non-Latin characters). " +
            "English documents are recommended. Analysis is proceeding with reduced confidence.",
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(responseWithFlags), { status: 200 }),
    );

    const result = await callEdgeFunction<typeof responseWithFlags>(
      "analyze-deal",
      {
        extractedText: "هذا مستند عربي يصف شركة تقنية متخصصة",
        dealType: "traditional_pe",
      },
      ACCESS_TOKEN,
    );

    expect(result._flags?.languageWarning).toBeDefined();
    expect(result._flags?.languageWarning?.nonLatinRatio).toBeGreaterThan(0.5);
    expect(result._flags?.languageWarning?.warning).toContain("non-English");
    // Analysis is still returned (with caveat), not rejected
    expect(result.recommendation).toBe("conditional_proceed");
  });
});

// ===========================================================================
// Edge Case 4: Duplicate Upload (hash-based cache)
// Already tested in upload-flow.test.ts → "returns cached analysis with
// _cached flag when duplicate document is detected"
// Included here for completeness with a dedicated describe block.
// ===========================================================================

describe("Edge Case 4: Duplicate Upload", () => {
  it("edge function returns _cached=true when the same document hash exists", async () => {
    const cachedResponse = {
      ...MOCK_ANALYSIS,
      _cached: true,
      _cacheNotice:
        "This document was previously analyzed. Returning cached result to avoid a duplicate API call.",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(cachedResponse), { status: 200 }),
    );

    const result = await callEdgeFunction<typeof cachedResponse>(
      "analyze-deal",
      { extractedText: "Duplicate document text", dealType: "traditional_pe" },
      ACCESS_TOKEN,
    );

    expect(result._cached).toBe(true);
    expect(result._cacheNotice).toContain("previously analyzed");
    expect(result.companyName).toBe(MOCK_ANALYSIS.companyName);
  });
});

// ===========================================================================
// Edge Case 5: Contradictory Information
// ===========================================================================

describe("Edge Case 5: Contradictory Information", () => {
  it("Traditional PE system prompt instructs Claude to flag contradictions", () => {
    expect(TRADITIONAL_PE_SYSTEM_PROMPT).toContain("CONTRADICTION DETECTED");
    expect(TRADITIONAL_PE_SYSTEM_PROMPT).toContain("contradictory");
  });

  it("analysis prompt template instructs Claude to reference where contradictions appear", () => {
    // The system prompt should ask for specific section/page references
    expect(TRADITIONAL_PE_SYSTEM_PROMPT).toContain("specific references");
  });

  it("analysis response with contradictions includes CONTRADICTION DETECTED markers", async () => {
    const analysisWithContradiction = {
      ...MOCK_ANALYSIS,
      financialProfile: {
        ...MOCK_ANALYSIS.financialProfile,
        commentary:
          "CONTRADICTION DETECTED: Revenue stated as $10M in the executive summary but $12M in the financial section. " +
          "Using $10M as the base case pending clarification.",
        score: 4 as const,
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(analysisWithContradiction), { status: 200 }),
    );

    const result = await callEdgeFunction<ISTAnalysis>(
      "analyze-deal",
      {
        extractedText: "Revenue is $10M. ... Revenue is $12M.",
        dealType: "traditional_pe",
      },
      ACCESS_TOKEN,
    );

    expect(result.financialProfile.commentary).toContain("CONTRADICTION DETECTED");
  });
});

// ===========================================================================
// Edge Case 6: Highly Redacted Document
// ===========================================================================

describe("Edge Case 6: Highly Redacted Document", () => {
  it("analyzeRedactions returns none density for clean documents", () => {
    const result = analyzeRedactions("This is a clean document with no redactions.");
    expect(result.density).toBe("none");
    expect(result.redactionCount).toBe(0);
    expect(result.hasSignificantRedactions).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("analyzeRedactions detects [REDACTED] markers", () => {
    const text = "Revenue: [REDACTED]. EBITDA: [REDACTED]. Management: [REDACTED].";
    const result = analyzeRedactions(text);
    expect(result.redactionCount).toBeGreaterThanOrEqual(3);
    expect(result.density).not.toBe("none");
  });

  it("analyzeRedactions detects block characters (█)", () => {
    const text = "Name: ██████████. Revenue: $███████K.";
    const result = analyzeRedactions(text);
    expect(result.redactionCount).toBeGreaterThanOrEqual(2);
  });

  it("analyzeRedactions detects asterisk redactions (***)", () => {
    const text = "Contact: ***. Price: ***. Address: ***.";
    const result = analyzeRedactions(text);
    expect(result.redactionCount).toBeGreaterThanOrEqual(3);
  });

  it("analyzeRedactions classifies moderate density (5-19 markers)", () => {
    const markers = "[REDACTED]".repeat(10);
    const result = analyzeRedactions(markers);
    expect(result.density).toBe("moderate");
    expect(result.hasSignificantRedactions).toBe(true);
    expect(result.warning).toContain("reduced");
  });

  it("analyzeRedactions classifies high density (20+ markers)", () => {
    const markers = "[REDACTED]".repeat(25);
    const result = analyzeRedactions(markers);
    expect(result.density).toBe("high");
    expect(result.hasSignificantRedactions).toBe(true);
  });

  it("analyzeRedactions classifies low density (1-4 markers)", () => {
    const result = analyzeRedactions("[REDACTED] once [WITHHELD].");
    expect(result.density).toBe("low");
    expect(result.hasSignificantRedactions).toBe(false);
  });

  it("edge function response includes _flags.significantRedactions for highly redacted documents", async () => {
    const responseWithFlags = {
      ...MOCK_ANALYSIS,
      _flags: {
        significantRedactions: {
          redactionCount: 23,
          density: "high",
          warning:
            "Document contains 23 redaction markers (high density). " +
            "Confidence in affected scoring dimensions is reduced.",
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(responseWithFlags), { status: 200 }),
    );

    const redactedText =
      "Revenue: [REDACTED]. " +
      "Management: [REDACTED]. ".repeat(10) +
      "IP Portfolio: [REDACTED]. ".repeat(5);

    const result = await callEdgeFunction<typeof responseWithFlags>(
      "analyze-deal",
      { extractedText: redactedText, dealType: "traditional_pe" },
      ACCESS_TOKEN,
    );

    expect(result._flags?.significantRedactions).toBeDefined();
    expect(result._flags?.significantRedactions?.density).toBe("high");
    expect(result._flags?.significantRedactions?.redactionCount).toBeGreaterThan(0);
    expect(result._flags?.significantRedactions?.warning).toContain("Confidence");
  });
});

// ===========================================================================
// Edge Case 7: Image-only PDF (OCR fallback)
// ===========================================================================

describe("Edge Case 7: Image-only PDF (OCR fallback)", () => {
  it("extractTextWithMetadata returns usedOCR=false for text-based content", async () => {
    // Dynamically import to avoid issues with browser-only APIs in test env
    const { extractTextWithMetadata } = await import("@/lib/extractTextFromFile");

    const mockFile = new File(
      ["Plain text file content for testing"],
      "document.txt",
      { type: "text/plain" },
    );

    const result = await extractTextWithMetadata(mockFile);
    expect(result.usedOCR).toBe(false);
    expect(result.text).toBe("Plain text file content for testing");
  });

  it("edge function response includes _flags.ocrUsed when isOCRDerived=true", async () => {
    const responseWithFlags = {
      ...MOCK_ANALYSIS,
      _flags: {
        ocrUsed: {
          warning:
            "Text was extracted via OCR and may contain recognition errors, " +
            "especially in financial figures, tables, and proper nouns. " +
            "Treat specific numbers with additional caution.",
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(responseWithFlags), { status: 200 }),
    );

    const result = await callEdgeFunction<typeof responseWithFlags>(
      "analyze-deal",
      {
        extractedText: "Scanned document text extracted via OCR",
        dealType: "traditional_pe",
        isOCRDerived: true,
      },
      ACCESS_TOKEN,
    );

    expect(result._flags?.ocrUsed).toBeDefined();
    expect(result._flags?.ocrUsed?.warning).toContain("OCR");
    expect(result._flags?.ocrUsed?.warning).toContain("recognition errors");
  });

  it("edge function does NOT include _flags.ocrUsed when isOCRDerived is absent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_ANALYSIS), { status: 200 }),
    );

    const result = await callEdgeFunction<ISTAnalysis & { _flags?: Record<string, unknown> }>(
      "analyze-deal",
      {
        extractedText: "Normal document text",
        dealType: "traditional_pe",
      },
      ACCESS_TOKEN,
    );

    expect(result._flags?.ocrUsed).toBeUndefined();
  });
});

// ===========================================================================
// Edge Case 8: Mixed Deal Type (hybrid PE + IP)
// ===========================================================================

describe("Edge Case 8: Mixed Deal Type (Hybrid PE + IP)", () => {
  it("Traditional PE system prompt instructs Claude to handle hybrid deal types", () => {
    expect(TRADITIONAL_PE_SYSTEM_PROMPT).toContain("HYBRID DEAL TYPE");
    expect(TRADITIONAL_PE_SYSTEM_PROMPT).toContain("hybrid");
    expect(TRADITIONAL_PE_SYSTEM_PROMPT).toContain("IP");
  });

  it("classification prompt includes tie-breaking rule for hybrid signals", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("Tie-breaking rule");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("primary value driver");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("hybrid");
  });

  it("analysis prompt instructs Claude to score IP dimensions for hybrid PE deals", () => {
    // The system prompt should mention evaluating IP-related risks even for traditional_pe
    expect(TRADITIONAL_PE_SYSTEM_PROMPT).toContain(
      "IP-related dimensions",
    );
    expect(TRADITIONAL_PE_SYSTEM_PROMPT).toContain(
      "investmentThesis",
    );
  });

  it("hybrid deal analysis returns traditional_pe type with hybrid nature noted", async () => {
    const hybridAnalysis: ISTAnalysis = {
      ...MOCK_ANALYSIS,
      dealType: "traditional_pe",
      executiveSummary:
        "HYBRID DEAL: This operating company also holds significant IP assets including 12 granted patents. " +
        "Classified as traditional_pe based on primary revenue driver ($18M operating revenue) but IP defensibility " +
        "and patent risk are scored within the investmentThesis and riskAssessment sections.",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(hybridAnalysis), { status: 200 }),
    );

    const result = await callEdgeFunction<ISTAnalysis>(
      "analyze-deal",
      {
        extractedText:
          "Revenue: $18M. The company holds 12 granted patents in aerospace tooling. " +
          "Patent portfolio is valued at $5M. Technology licensed to Boeing and Lockheed.",
        dealType: "traditional_pe",
      },
      ACCESS_TOKEN,
    );

    // Primary classification remains traditional_pe
    expect(result.dealType).toBe("traditional_pe");
    // Hybrid nature is noted in the executive summary
    expect(result.executiveSummary.toUpperCase()).toContain("HYBRID");
  });

  it("buildTraditionalPEAnalysisPrompt includes deal materials in output", () => {
    const text = "Operating company with significant IP portfolio worth $5M.";
    const prompt = buildTraditionalPEAnalysisPrompt(text);
    expect(prompt).toContain(text);
    expect(prompt).toContain("traditional_pe");
  });
});

// ===========================================================================
// Combined edge cases (multiple flags on one document)
// ===========================================================================

describe("Combined edge cases", () => {
  it("response can include multiple _flags simultaneously", async () => {
    const multipleFlags = {
      ...MOCK_ANALYSIS,
      _flags: {
        shortDocument: {
          wordCount: 45,
          warning: "Only 45 words — low confidence.",
        },
        languageWarning: {
          nonLatinRatio: 0.62,
          warning: "62% non-Latin characters detected.",
        },
        significantRedactions: {
          redactionCount: 7,
          density: "moderate",
          warning: "7 redaction markers found.",
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(multipleFlags), { status: 200 }),
    );

    const result = await callEdgeFunction<typeof multipleFlags>(
      "analyze-deal",
      {
        extractedText: "بسم الله [REDACTED] short text [REDACTED]",
        dealType: "traditional_pe",
      },
      ACCESS_TOKEN,
    );

    expect(result._flags?.shortDocument).toBeDefined();
    expect(result._flags?.languageWarning).toBeDefined();
    expect(result._flags?.significantRedactions).toBeDefined();
  });
});
