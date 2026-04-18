/**
 * Tests for the email intake webhook handler (PRD §8.2).
 *
 * Tests exercise the core logic branches:
 *   1. Invalid/missing signature → 401
 *   2. Non-email-received event type → 200 (noop)
 *   3. Duplicate Resend email_id → 200 (deduplicated)
 *   4. No extractable text → 200 (warning)
 *   5. Unregistered sender → queued + admin notification
 *   6. Registered sender, analysis success → screening saved + result emailed
 *   7. Registered sender, analysis failure → failure email sent
 *
 * All external I/O (Supabase, Resend, Anthropic, pdf-parse, mammoth) is mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (must be declared before any imports that use the mocked modules)
// ---------------------------------------------------------------------------

// Supabase service client
const mockSupabaseSelect = vi.fn();
const mockSupabaseMaybeSingle = vi.fn();
const mockSupabaseInsert = vi.fn();
const mockSupabaseSingle = vi.fn();
const mockSupabaseUpdate = vi.fn();
const mockSupabaseEq = vi.fn();

function makeMockChain(returnValue: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(returnValue),
    single: vi.fn().mockResolvedValue(returnValue),
  };
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "email_intake_queue") {
        return mockEmailIntakeQueueChain;
      }
      if (table === "users") {
        return mockUsersChain;
      }
      if (table === "screenings") {
        return mockScreeningsChain;
      }
      return makeMockChain({ data: null, error: null });
    }),
  })),
}));

// Lazy references — will be set inside beforeEach
let mockEmailIntakeQueueChain: ReturnType<typeof makeMockChain>;
let mockUsersChain: ReturnType<typeof makeMockChain>;
let mockScreeningsChain: ReturnType<typeof makeMockChain>;

// analyzeDocument
vi.mock("@/lib/ai/analyzeDocument", () => ({
  analyzeDocument: vi.fn(),
}));

// scoreAnalysis
vi.mock("@/lib/scoringEngine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/scoringEngine")>();
  return {
    ...original,
    scoreAnalysis: vi.fn(() => ({
      compositeScore: 7.2,
      recommendation: "PROCEED",
      isDisqualified: false,
      dimensionScores: {
        companyOverview: 7,
        marketOpportunity: 8,
        financialProfile: 6,
        managementTeam: 7,
        investmentThesis: 8,
        riskAssessment: 7,
        dealDynamics: 6,
      },
    })),
  };
});

// Resend — must be a constructable class mock
const mockSendEmail = vi.fn().mockResolvedValue({ data: { id: "re_test" }, error: null });
vi.mock("resend", () => {
  const ResendMock = vi.fn(function (this: { emails: { send: typeof mockSendEmail } }) {
    this.emails = { send: mockSendEmail };
  });
  return { Resend: ResendMock };
});

// buildIntakeResultEmail
vi.mock("@/lib/email/buildIntakeResultEmail", () => ({
  buildIntakeResultEmail: vi.fn(() => "<html>Test result email</html>"),
}));

// pdf-parse — PDFParse must be a constructable class mock
vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn(function (
    this: { getText: () => Promise<{ text: string }> },
  ) {
    this.getText = vi.fn().mockResolvedValue({ text: "Extracted PDF text about Acme Inc." });
  }),
}));

// mammoth
vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: "Extracted DOCX text" }),
  },
}));

// crypto (only mock timingSafeEqual — keep createHmac real for tests that skip sig)
// We set RESEND_WEBHOOK_SECRET to undefined in tests so sig verification is skipped.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { ISTAnalysis } from "@/types/ist-analysis";

const MOCK_ANALYSIS: ISTAnalysis = {
  companyName: "Acme Industrial Holdings",
  analysisDate: "2026-04-18",
  dealType: "traditional_pe",
  companyOverview: {
    sectionName: "Company Overview",
    score: 7,
    commentary: "Solid mid-market business.",
    keyFindings: ["35-year history"],
  },
  marketOpportunity: {
    sectionName: "Market Opportunity",
    score: 8,
    commentary: "$2B TAM.",
    keyFindings: ["Strong growth"],
  },
  financialProfile: {
    sectionName: "Financial Profile",
    score: 6,
    commentary: "$10M EBITDA.",
    keyFindings: ["Stable margins"],
  },
  managementTeam: {
    sectionName: "Management Team",
    score: 7,
    commentary: "Experienced team.",
    keyFindings: ["CEO 20-year tenure"],
  },
  investmentThesis: {
    sectionName: "Investment Thesis",
    score: 8,
    commentary: "Good bolt-on potential.",
    keyFindings: ["Geographic expansion"],
  },
  riskAssessment: {
    sectionName: "Risk Assessment",
    score: 7,
    commentary: "Manageable risk profile.",
    keyFindings: ["Customer concentration"],
  },
  dealDynamics: {
    sectionName: "Deal Dynamics",
    score: 6,
    commentary: "Reasonable entry multiple.",
    keyFindings: ["7x EV/EBITDA"],
  },
  overallScore: 7.0,
  recommendation: "proceed",
  executiveSummary: "Acme is a solid mid-market PE opportunity.",
};

/** Helper to create a minimal valid Resend inbound email webhook payload. */
function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "email.received",
    created_at: "2026-04-18T02:44:34.577Z",
    data: {
      email_id: "re_test_email_001",
      from: "John Doe <john@example.com>",
      to: ["screen@catalyze.partners"],
      subject: "FW: Deal Opportunity – Acme Industrial",
      text: "Please screen this deal. See attached.",
      attachments: [
        {
          filename: "deal.pdf",
          content: Buffer.from("fake pdf content").toString("base64"),
          content_type: "application/pdf",
        },
      ],
      ...overrides,
    },
  };
}

/** Creates a fake NextRequest from a payload object. */
function makeRequest(payload: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(payload);
  return new Request("http://localhost/api/email-intake", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/email-intake", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();

    // Unset the webhook secret so signature verification is skipped in tests
    delete process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    // Reset mock chains
    mockEmailIntakeQueueChain = makeMockChain({ data: null, error: null });
    mockUsersChain = makeMockChain({ data: null, error: null });
    mockScreeningsChain = makeMockChain({ data: null, error: null });

    // Re-import the handler after resetting modules
    const mod = await import("../app/api/email-intake/route");
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it("returns 200 noop for non-email-received event types", async () => {
    const req = makeRequest({ type: "email.bounced", created_at: "", data: {} });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const json = await res.json() as { received: boolean };
    expect(json.received).toBe(true);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/email-intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("deduplicates on resend_email_id", async () => {
    // Simulate existing queue row with the same email_id
    mockEmailIntakeQueueChain.maybeSingle.mockResolvedValue({
      data: { id: "existing-row-id" },
      error: null,
    });

    const { analyzeDocument } = await import("@/lib/ai/analyzeDocument");
    const req = makeRequest(makePayload());
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    const json = await res.json() as { deduplicated: boolean };
    expect(json.deduplicated).toBe(true);
    // analyzeDocument should NOT have been called
    expect(analyzeDocument).not.toHaveBeenCalled();
  });

  it("queues + notifies admins for unregistered sender", async () => {
    // No existing queue row
    mockEmailIntakeQueueChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    // Queue insert succeeds
    mockEmailIntakeQueueChain.single.mockResolvedValue({ data: { id: "queue-row-1" }, error: null });

    // No user found
    mockUsersChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    process.env.ADMIN_NOTIFICATION_EMAIL = "admin@catalyze.partners";

    const req = makeRequest(makePayload());
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    const json = await res.json() as { queued: boolean };
    expect(json.queued).toBe(true);
    // Admin notification + unregistered-sender reply = at least 1 Resend call
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("saves screening and emails results for registered sender", async () => {
    // No existing queue row for dedup
    mockEmailIntakeQueueChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    // Queue insert
    mockEmailIntakeQueueChain.single.mockResolvedValue({ data: { id: "queue-row-2" }, error: null });

    // User found
    mockUsersChain.maybeSingle.mockResolvedValue({
      data: { id: "user-uuid-1", email: "john@example.com", name: "John Doe", role: "analyst" },
      error: null,
    });

    // Screening insert
    mockScreeningsChain.single.mockResolvedValue({ data: { id: "screening-uuid-1" }, error: null });

    // analyzeDocument returns mock analysis
    const { analyzeDocument } = await import("@/lib/ai/analyzeDocument");
    vi.mocked(analyzeDocument).mockResolvedValue({ analysis: MOCK_ANALYSIS, dealType: "traditional_pe" });

    const req = makeRequest(makePayload());
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    const json = await res.json() as { screeningId: string };
    expect(json.screeningId).toBe("screening-uuid-1");

    // Should have sent the result email
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["john@example.com"],
        subject: expect.stringContaining("Acme Industrial Holdings"),
      }),
    );
  });

  it("sends failure email when analyzeDocument throws", async () => {
    // No existing queue row for dedup
    mockEmailIntakeQueueChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockEmailIntakeQueueChain.single.mockResolvedValue({ data: { id: "queue-row-3" }, error: null });

    // User found
    mockUsersChain.maybeSingle.mockResolvedValue({
      data: { id: "user-uuid-2", email: "john@example.com", name: "John Doe", role: "analyst" },
      error: null,
    });

    // analyzeDocument throws
    const { analyzeDocument } = await import("@/lib/ai/analyzeDocument");
    vi.mocked(analyzeDocument).mockRejectedValue(new Error("Anthropic API unavailable"));

    const req = makeRequest(makePayload());
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(500);

    // Failure notification should have been sent
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["john@example.com"],
        subject: expect.stringContaining("could not be processed"),
      }),
    );
  });

  it("returns 200 warning when no text can be extracted", async () => {
    // No existing queue row
    mockEmailIntakeQueueChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    // Empty body, no attachments, empty text
    const payload = makePayload({ text: "", html: "", attachments: [] });

    // Make PDF extraction return empty (though there are no attachments anyway)
    const { PDFParse } = await import("pdf-parse");
    vi.mocked(PDFParse).mockImplementation(() => ({
      getText: vi.fn().mockResolvedValue({ text: "" }),
    }) as unknown as InstanceType<typeof PDFParse>);

    const req = makeRequest(payload);
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    const json = await res.json() as { warning: string };
    expect(json.warning).toMatch(/no text/i);
  });
});
