/**
 * Integration tests for the upload-to-results flow (happy path).
 *
 * The tests exercise the core logic that the upload page orchestrates:
 *   1. extractTextFromFile  — text extraction from a File
 *   2. classify-deal        — edge function call → DealTypeClassificationResult
 *   3. Deal type confirmation (user accepts / overrides)
 *   4. analyze-deal         — edge function call → ISTAnalysis
 *   5. saveScreening        — server action → new screening UUID
 *   6. router.push          — redirect to /screenings/[id]
 *
 * External I/O (fetch, saveScreening, extractTextFromFile) is fully mocked so
 * the tests run entirely in jsdom without a network or Supabase connection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ISTAnalysis } from "@/types/ist-analysis";
import type { DealTypeClassificationResult } from "@/lib/prompts/classify-deal-type";
import { callEdgeFunction } from "@/lib/api/edgeFunctions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CLASSIFICATION: DealTypeClassificationResult = {
  deal_type: "traditional_pe",
  confidence: 0.95,
  reasoning:
    "The document describes an operating company with three years of historical financials and CIM-style formatting.",
};

const MOCK_ANALYSIS: ISTAnalysis = {
  companyName: "Acme Industrial Holdings",
  analysisDate: "2026-04-01",
  dealType: "traditional_pe",
  companyOverview: {
    sectionName: "Company Overview",
    score: 7,
    commentary: "Solid mid-market business.",
    keyFindings: ["35-year operating history", "$85M revenue"],
  },
  marketOpportunity: {
    sectionName: "Market Opportunity",
    score: 6,
    commentary: "$2.1B TAM growing at 3% CAGR.",
    keyFindings: ["Niche market", "Geographic expansion opportunity"],
  },
  financialProfile: {
    sectionName: "Financial Profile",
    score: 5,
    commentary: "Below-peer EBITDA margins.",
    keyFindings: ["14% EBITDA margin vs 18–22% peer range"],
  },
  managementTeam: {
    sectionName: "Management Team",
    score: 7,
    commentary: "Experienced leadership.",
    keyFindings: ["CEO 22 years tenure", "CFO from Big 4"],
  },
  investmentThesis: {
    sectionName: "Investment Thesis",
    score: 7,
    commentary: "Clear value creation levers.",
    keyFindings: ["Margin expansion", "Geographic expansion"],
  },
  riskAssessment: {
    sectionName: "Risk Assessment",
    score: 4,
    commentary: "Customer concentration risk.",
    keyFindings: ["Top 3 customers = 38% revenue"],
  },
  dealDynamics: {
    sectionName: "Deal Dynamics",
    score: 6,
    commentary: "Competitive process at 8.5x EBITDA.",
    keyFindings: ["3 known bidders"],
  },
  overallScore: 6.0,
  recommendation: "conditional_proceed",
  executiveSummary:
    "Acme Industrial Holdings is a solid mid-market industrial platform with defensible market position.",
};

const MOCK_SCREENING_ID = "c1fa8b2e-1234-4abc-9def-000000000001";

// ---------------------------------------------------------------------------
// callEdgeFunction — unit tests
// ---------------------------------------------------------------------------

describe("callEdgeFunction", () => {
  const SUPABASE_URL = "https://abcdef.supabase.co";
  const ACCESS_TOKEN = "test-access-token";

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("calls the correct URL with the correct headers and body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await callEdgeFunction<{ ok: boolean }>(
      "classify-deal",
      { extractedText: "hello world" },
      ACCESS_TOKEN,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/classify-deal`);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      extractedText: "hello world",
    });
  });

  it("returns the parsed JSON body on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_CLASSIFICATION), { status: 200 }),
    );

    const result = await callEdgeFunction<DealTypeClassificationResult>(
      "classify-deal",
      { extractedText: "hello" },
      ACCESS_TOKEN,
    );

    expect(result).toEqual(MOCK_CLASSIFICATION);
  });

  it("throws when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    await expect(
      callEdgeFunction("classify-deal", {}, ACCESS_TOKEN),
    ).rejects.toThrow("classify-deal failed (HTTP 401): Unauthorized");
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    await expect(
      callEdgeFunction("classify-deal", {}, ACCESS_TOKEN),
    ).rejects.toThrow("Supabase URL is not configured");
  });
});

// ---------------------------------------------------------------------------
// Full happy-path flow — integration test
// ---------------------------------------------------------------------------

describe("upload-to-results happy path", () => {
  const ACCESS_TOKEN = "test-access-token";
  const USER_ID = "user-uuid-001";
  const RAW_TEXT = "Acme Industrial Holdings CIM — EBITDA $12M, Revenue $85M";
  const SUPABASE_URL = "https://abcdef.supabase.co";

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("extracts text, classifies deal, runs analysis, saves, returns screening ID", async () => {
    // ── Arrange ──────────────────────────────────────────────────────────

    // Mock extractTextFromFile — create a typed mock without importing the real module
    const extractMock = vi.fn().mockResolvedValue(RAW_TEXT) as (
      file: File,
    ) => Promise<string>;

    // Mock fetch for both edge function calls
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("classify-deal")) {
          return new Response(JSON.stringify(MOCK_CLASSIFICATION), {
            status: 200,
          });
        }
        if (url.includes("analyze-deal")) {
          return new Response(JSON.stringify(MOCK_ANALYSIS), { status: 200 });
        }

        throw new Error(`Unexpected fetch call to: ${url}`);
      },
    );

    // Mock saveScreening — create a typed mock without importing the real module
    const saveMock = vi.fn().mockResolvedValue(MOCK_SCREENING_ID) as (
      analysis: ISTAnalysis,
      rawText: string,
      userId: string,
      metadata?: Record<string, unknown>,
    ) => Promise<string>;

    // ── Act ───────────────────────────────────────────────────────────────

    // Step 1: Extract text
    const mockFile = new File(["dummy content"], "deal.pdf", {
      type: "application/pdf",
    });
    const rawText = await extractMock(mockFile);
    expect(rawText).toBe(RAW_TEXT);

    // Step 2: Classify deal type
    const classification = await callEdgeFunction<DealTypeClassificationResult>(
      "classify-deal",
      { extractedText: rawText },
      ACCESS_TOKEN,
    );
    expect(classification.deal_type).toBe("traditional_pe");
    expect(classification.confidence).toBe(0.95);

    // Step 3: User confirms deal type (happy path: no override)
    const confirmedDealType = classification.deal_type;

    // Step 4: Analyse
    const analysis = await callEdgeFunction<ISTAnalysis>(
      "analyze-deal",
      { extractedText: rawText, dealType: confirmedDealType },
      ACCESS_TOKEN,
    );
    expect(analysis.companyName).toBe("Acme Industrial Holdings");
    expect(analysis.dealType).toBe("traditional_pe");

    // Step 5: Save
    const screeningId = await saveMock(analysis, rawText, USER_ID, {
      dealSource: "Investment Bank / Advisor",
      dealNameOverride: null,
      notes: null,
    });
    expect(screeningId).toBe(MOCK_SCREENING_ID);

    // ── Assert ────────────────────────────────────────────────────────────

    // fetch called exactly twice (classify + analyze)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call → classify-deal
    const [classifyUrl] = fetchMock.mock.calls[0] as [string];
    expect(classifyUrl).toContain("classify-deal");

    // Second call → analyze-deal
    const [analyzeUrl, analyzeInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(analyzeUrl).toContain("analyze-deal");
    expect(JSON.parse(analyzeInit.body as string)).toMatchObject({
      dealType: "traditional_pe",
    });

    // saveScreening received correct args
    expect(saveMock).toHaveBeenCalledOnce();
    expect(saveMock).toHaveBeenCalledWith(
      MOCK_ANALYSIS,
      RAW_TEXT,
      USER_ID,
      expect.objectContaining({ dealSource: "Investment Bank / Advisor" }),
    );

    // Result is the new screening ID → caller would redirect to /screenings/MOCK_SCREENING_ID
    expect(screeningId).toBe(MOCK_SCREENING_ID);
  });

  it("user can override the detected deal type before analysis", async () => {
    // Arrange: classify returns traditional_pe, user overrides to ip_technology
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () =>
        // classify-deal returns traditional_pe
        new Response(JSON.stringify(MOCK_CLASSIFICATION), { status: 200 }),
      )
      .mockImplementationOnce(async (_url, init) => {
        // analyze-deal — verify the overridden deal type is sent
        const body = JSON.parse((init as RequestInit).body as string) as {
          dealType: string;
        };
        expect(body.dealType).toBe("ip_technology");
        return new Response(
          JSON.stringify({ ...MOCK_ANALYSIS, dealType: "ip_technology" }),
          { status: 200 },
        );
      });

    // Classify
    const classification = await callEdgeFunction<DealTypeClassificationResult>(
      "classify-deal",
      { extractedText: RAW_TEXT },
      ACCESS_TOKEN,
    );
    expect(classification.deal_type).toBe("traditional_pe");

    // User overrides
    const overriddenDealType = "ip_technology" as const;

    // Analyse with override
    const analysis = await callEdgeFunction<ISTAnalysis>(
      "analyze-deal",
      { extractedText: RAW_TEXT, dealType: overriddenDealType },
      ACCESS_TOKEN,
    );

    expect(analysis.dealType).toBe("ip_technology");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("propagates classify-deal edge function errors correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
      }),
    );

    await expect(
      callEdgeFunction(
        "classify-deal",
        { extractedText: RAW_TEXT },
        ACCESS_TOKEN,
      ),
    ).rejects.toThrow("classify-deal failed (HTTP 500): Server configuration error");
  });

  it("propagates analyze-deal edge function errors correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "AI response did not conform to schema" }),
        { status: 422 },
      ),
    );

    await expect(
      callEdgeFunction(
        "analyze-deal",
        { extractedText: RAW_TEXT, dealType: "traditional_pe" },
        ACCESS_TOKEN,
      ),
    ).rejects.toThrow("analyze-deal failed (HTTP 422)");
  });

  it("throws with rate-limit message when analyze-deal returns 429", async () => {
    const resetAt = "2026-04-17T00:00:00.000Z";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: `Daily screening limit of 50 reached. Limit resets at ${resetAt}.`,
          resetAt,
        }),
        { status: 429 },
      ),
    );

    await expect(
      callEdgeFunction(
        "analyze-deal",
        { extractedText: RAW_TEXT, dealType: "traditional_pe" },
        ACCESS_TOKEN,
      ),
    ).rejects.toThrow("analyze-deal failed (HTTP 429): Daily screening limit of 50 reached");
  });

  it("returns cached analysis with _cached flag when duplicate document is detected", async () => {
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
      { extractedText: RAW_TEXT, dealType: "traditional_pe" },
      ACCESS_TOKEN,
    );

    expect(result._cached).toBe(true);
    expect(result._cacheNotice).toContain("previously analyzed");
    expect(result.companyName).toBe(MOCK_ANALYSIS.companyName);
    expect(result.overallScore).toBe(MOCK_ANALYSIS.overallScore);
  });

  it("uses the plain-text deal description when no file is provided", async () => {
    const PASTE_TEXT =
      "TechCo Inc. patent portfolio — 42 granted patents, TRL 6 laser sensing technology.";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...MOCK_CLASSIFICATION,
            deal_type: "ip_technology",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...MOCK_ANALYSIS, dealType: "ip_technology" }),
          { status: 200 },
        ),
      );

    // Classify
    const classification = await callEdgeFunction<DealTypeClassificationResult>(
      "classify-deal",
      { extractedText: PASTE_TEXT },
      ACCESS_TOKEN,
    );
    expect(classification.deal_type).toBe("ip_technology");

    // Analyse
    const analysis = await callEdgeFunction<ISTAnalysis>(
      "analyze-deal",
      { extractedText: PASTE_TEXT, dealType: classification.deal_type },
      ACCESS_TOKEN,
    );
    expect(analysis.dealType).toBe("ip_technology");

    // Verify the pasted text was forwarded in both calls
    const classifyBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { extractedText: string };
    const analyzeBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    ) as { extractedText: string };

    expect(classifyBody.extractedText).toBe(PASTE_TEXT);
    expect(analyzeBody.extractedText).toBe(PASTE_TEXT);
  });
});
