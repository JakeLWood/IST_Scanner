/**
 * Unit tests for PRD §8.1 Add to DealFlow integration.
 *
 * Covers the addToDealFlow server action:
 *   - Successfully inserts a deal row and returns the new UUID
 *   - Propagates Supabase insert errors as thrown exceptions
 *   - Correctly maps all input fields to the insert payload
 *   - Treats optional fields as null when omitted
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AddToDealFlowInput } from "@/lib/actions/addToDealFlow";

// ---------------------------------------------------------------------------
// Mock Supabase client (lib/supabase/server)
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockInsert = vi.fn(() => ({ select: mockSelect }));
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
  })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_INPUT: AddToDealFlowInput = {
  companyName: "Acme Industrial Holdings",
  dealSource: "Banker",
  dealType: "traditional_pe",
  istScreeningId: "screening-uuid-1234",
  userId: "user-uuid-5678",
};

const DEAL_ID = "deal-uuid-abcd";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("addToDealFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a deal row and returns its UUID", async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: DEAL_ID }, error: null });

    const { addToDealFlow } = await import("@/lib/actions/addToDealFlow");
    const result = await addToDealFlow(BASE_INPUT);

    expect(result).toBe(DEAL_ID);
    expect(mockFrom).toHaveBeenCalledWith("deals");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_name: "Acme Industrial Holdings",
        deal_source: "Banker",
        deal_type: "traditional_pe",
        ist_screening_id: "screening-uuid-1234",
        created_by: "user-uuid-5678",
        status: "active",
      })
    );
  });

  it("maps optional fields as null when omitted", async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: DEAL_ID }, error: null });

    const { addToDealFlow } = await import("@/lib/actions/addToDealFlow");
    await addToDealFlow({
      companyName: "MinimalCo",
      istScreeningId: "scr-1",
      userId: "usr-1",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sector: null,
        revenue: null,
        ebitda: null,
        location: null,
        deal_source: null,
        deal_type: null,
      })
    );
  });

  it("maps all provided optional fields into the insert payload", async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: DEAL_ID }, error: null });

    const { addToDealFlow } = await import("@/lib/actions/addToDealFlow");
    await addToDealFlow({
      ...BASE_INPUT,
      sector: "Industrials",
      revenue: "$85M",
      ebitda: "$12M",
      location: "Chicago, IL",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sector: "Industrials",
        revenue: "$85M",
        ebitda: "$12M",
        location: "Chicago, IL",
      })
    );
  });

  it("throws when the Supabase insert fails", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "unique constraint violation" },
    });

    const { addToDealFlow } = await import("@/lib/actions/addToDealFlow");
    await expect(addToDealFlow(BASE_INPUT)).rejects.toThrow(
      "Failed to add deal to DealFlow: unique constraint violation"
    );
  });

  it("inserts with status 'active' by default", async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: DEAL_ID }, error: null });

    const { addToDealFlow } = await import("@/lib/actions/addToDealFlow");
    await addToDealFlow(BASE_INPUT);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });
});
