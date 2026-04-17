/**
 * Unit tests for PRD §8.3 Market Research Enhancement helpers.
 *
 * Covers:
 *   - buildMarketResearchPrompt   — prompt content and search query injection
 *   - parseMarketResearchResponse — structured section extraction
 *   - injectMarketResearch        — injection into ISTAnalysis with [Web Research] tags
 */

import { describe, it, expect } from "vitest";
import type { ISTAnalysis } from "@/types/ist-analysis";
import {
  buildMarketResearchPrompt,
  parseMarketResearchResponse,
  injectMarketResearch,
  MARKET_RESEARCH_SYSTEM_PROMPT,
} from "@/lib/marketResearch";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const MOCK_ANALYSIS: ISTAnalysis = {
  companyName: "Apex Industrial Holdings",
  analysisDate: "2026-04-17",
  dealType: "traditional_pe",
  companyOverview: {
    sectionName: "Company Overview",
    score: 7,
    commentary:
      "Apex Industrial Holdings manufactures precision aerospace fasteners with strong switching costs.",
    keyFindings: ["35-year operating history", "$90M revenue"],
  },
  marketOpportunity: {
    sectionName: "Market Opportunity",
    score: 7,
    commentary:
      "The global aerospace fastener market is estimated at $12B with favorable secular tailwinds.",
    keyFindings: ["$12B TAM", "Fragmented market"],
  },
  financialProfile: {
    sectionName: "Financial Profile",
    score: 6,
    commentary: "EBITDA margins of 18% are in line with peers.",
    keyFindings: ["18% EBITDA margin"],
  },
  managementTeam: {
    sectionName: "Management Team",
    score: 7,
    commentary: "Experienced leadership team with 20+ years in aerospace.",
    keyFindings: ["CEO 22-year tenure"],
  },
  investmentThesis: {
    sectionName: "Investment Thesis",
    score: 7,
    commentary: "Buy-and-build platform in fragmented aerospace MRO sector.",
    keyFindings: ["Platform opportunity"],
  },
  riskAssessment: {
    sectionName: "Risk Assessment",
    score: 6,
    commentary: "Customer concentration risk with top 3 customers at 45% of revenue.",
    keyFindings: ["45% customer concentration"],
  },
  dealDynamics: {
    sectionName: "Deal Dynamics",
    score: 6,
    commentary: "Entry at 9x EV/EBITDA is in line with comparable transactions.",
    keyFindings: ["9x EV/EBITDA entry multiple"],
  },
  overallScore: 6.6,
  recommendation: "conditional_proceed",
  executiveSummary:
    "Apex Industrial Holdings is a solid aerospace fastener manufacturer with a clear buy-and-build thesis.",
};

const FULL_RESEARCH_TEXT = `\
MARKET SIZE & GROWTH:
The global aerospace fastener market was valued at $12.4B in 2023 and is projected to grow at a 6.2% CAGR through 2030, driven by commercial aviation recovery [Source: MarketsandMarkets, 2024]. Key tailwinds include increased aircraft build rates and MRO demand.

COMPARABLE TRANSACTIONS:
Recent aerospace components M&A transactions have averaged 9–11x EV/EBITDA [Source: PitchBook, 2024]. Notable deals include TransDigm's acquisition of Extant Components at 10.5x and HEICO's purchase of a precision parts supplier at 9.8x.

COMPETITIVE LANDSCAPE:
Key competitors include Precision Castparts (Berkshire Hathaway subsidiary), Arconic, and several regional specialty manufacturers [Source: IBISWorld, 2024]. Apex differentiates through its FAA-certified production lines and long-term OEM supply agreements.

SOURCES:
• MarketsandMarkets: https://www.marketsandmarkets.com/aerospace-fasteners
• PitchBook: Aerospace & Defense M&A Report 2024
• IBISWorld: Aerospace Fastener Manufacturing Industry Report 2024`;

// ---------------------------------------------------------------------------
// buildMarketResearchPrompt
// ---------------------------------------------------------------------------

describe("buildMarketResearchPrompt", () => {
  it("includes the company name in the prompt", () => {
    const prompt = buildMarketResearchPrompt(
      "Apex Industrial Holdings",
      "aerospace fastener manufacturer",
      "2025",
    );
    expect(prompt).toContain("Apex Industrial Holdings");
  });

  it("includes the current year in the comparable transactions search instruction", () => {
    const prompt = buildMarketResearchPrompt(
      "Test Corp",
      "software services",
      "2025",
    );
    expect(prompt).toContain("2025");
  });

  it("includes all three required section headers in the prompt", () => {
    const prompt = buildMarketResearchPrompt(
      "Test Corp",
      "software services",
      "2025",
    );
    expect(prompt).toContain("MARKET SIZE & GROWTH");
    expect(prompt).toContain("COMPARABLE TRANSACTIONS");
    expect(prompt).toContain("COMPETITIVE LANDSCAPE");
    expect(prompt).toContain("SOURCES");
  });

  it("instructs Claude to search for market size CAGR 2024", () => {
    const prompt = buildMarketResearchPrompt(
      "Test Corp",
      "software services",
      "2025",
    );
    expect(prompt).toMatch(/market size CAGR 2024/i);
  });

  it("instructs Claude to search for comparable M&A transactions with the year", () => {
    const prompt = buildMarketResearchPrompt(
      "Test Corp",
      "software services",
      "2025",
    );
    expect(prompt).toMatch(/comparable M&A transactions.*2025/i);
  });

  it("instructs Claude to search for company competitors using the company name", () => {
    const prompt = buildMarketResearchPrompt(
      "Apex Industrial Holdings",
      "aerospace fastener manufacturer",
      "2025",
    );
    expect(prompt).toContain("Apex Industrial Holdings");
    expect(prompt).toMatch(/Apex Industrial Holdings.*competitors/i);
  });

  it("includes the industry context in the prompt", () => {
    const context = "precision aerospace fastener manufacturer with strong switching costs";
    const prompt = buildMarketResearchPrompt("Test Corp", context, "2025");
    expect(prompt).toContain(context);
  });
});

describe("MARKET_RESEARCH_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof MARKET_RESEARCH_SYSTEM_PROMPT).toBe("string");
    expect(MARKET_RESEARCH_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions citation and sourcing requirements", () => {
    expect(MARKET_RESEARCH_SYSTEM_PROMPT).toMatch(/cite|source/i);
  });
});

// ---------------------------------------------------------------------------
// parseMarketResearchResponse
// ---------------------------------------------------------------------------

describe("parseMarketResearchResponse", () => {
  it("extracts all four sections from a well-formed response", () => {
    const findings = parseMarketResearchResponse(FULL_RESEARCH_TEXT);

    expect(findings.marketAndGrowth).toContain("$12.4B");
    expect(findings.marketAndGrowth).toContain("6.2% CAGR");
    expect(findings.comparableTransactions).toContain("9–11x EV/EBITDA");
    expect(findings.competitiveLandscape).toContain("Precision Castparts");
    expect(findings.sources).toHaveLength(3);
  });

  it("includes source citations in the sources array", () => {
    const findings = parseMarketResearchResponse(FULL_RESEARCH_TEXT);
    expect(findings.sources[0]).toContain("MarketsandMarkets");
    expect(findings.sources[1]).toContain("PitchBook");
    expect(findings.sources[2]).toContain("IBISWorld");
  });

  it("strips bullet prefix characters from sources", () => {
    const findings = parseMarketResearchResponse(FULL_RESEARCH_TEXT);
    for (const source of findings.sources) {
      expect(source).not.toMatch(/^[•\-*]\s/);
    }
  });

  it("returns empty strings for missing sections", () => {
    const partialText = `MARKET SIZE & GROWTH:
Global market is $5B growing at 8% CAGR.

SOURCES:
• SomeSource: http://example.com`;

    const findings = parseMarketResearchResponse(partialText);
    expect(findings.marketAndGrowth).toContain("$5B");
    expect(findings.comparableTransactions).toBe("");
    expect(findings.competitiveLandscape).toBe("");
  });

  it("returns empty arrays and strings for a completely unparseable response", () => {
    const findings = parseMarketResearchResponse("This text has no section headers.");
    expect(findings.marketAndGrowth).toBe("");
    expect(findings.comparableTransactions).toBe("");
    expect(findings.competitiveLandscape).toBe("");
    expect(findings.sources).toHaveLength(0);
  });

  it("handles extra whitespace around section content", () => {
    const looseText = `MARKET SIZE & GROWTH:

   The market is $10B with 5% CAGR.   

COMPARABLE TRANSACTIONS:
   Recent deals at 8x EBITDA.   

COMPETITIVE LANDSCAPE:
   Key players: A, B, C.   

SOURCES:
• Source A`;

    const findings = parseMarketResearchResponse(looseText);
    expect(findings.marketAndGrowth).toBe("The market is $10B with 5% CAGR.");
    expect(findings.comparableTransactions).toBe("Recent deals at 8x EBITDA.");
    expect(findings.competitiveLandscape).toBe("Key players: A, B, C.");
  });

  it("is case-insensitive for section headers", () => {
    const lowerCaseText = `market size & growth:
Market is large.

comparable transactions:
Transactions at 9x.

competitive landscape:
Competitors: X and Y.

sources:
• Some source`;

    const findings = parseMarketResearchResponse(lowerCaseText);
    expect(findings.marketAndGrowth).toBe("Market is large.");
    expect(findings.comparableTransactions).toBe("Transactions at 9x.");
    expect(findings.competitiveLandscape).toBe("Competitors: X and Y.");
  });
});

// ---------------------------------------------------------------------------
// injectMarketResearch
// ---------------------------------------------------------------------------

describe("injectMarketResearch", () => {
  const fullFindings = parseMarketResearchResponse(FULL_RESEARCH_TEXT);

  it("does not mutate the original analysis object", () => {
    const originalCommentary = MOCK_ANALYSIS.marketOpportunity.commentary;
    injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(MOCK_ANALYSIS.marketOpportunity.commentary).toBe(originalCommentary);
  });

  it("appends [Web Research] Market Size & Growth to marketOpportunity.commentary", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(enhanced.marketOpportunity.commentary).toContain(
      "[Web Research] Market Size & Growth:",
    );
    expect(enhanced.marketOpportunity.commentary).toContain("$12.4B");
  });

  it("appends [Web Research] Comparable Transactions to marketOpportunity.commentary", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(enhanced.marketOpportunity.commentary).toContain(
      "[Web Research] Comparable Transactions:",
    );
    expect(enhanced.marketOpportunity.commentary).toContain("9–11x EV/EBITDA");
  });

  it("preserves the original marketOpportunity commentary text", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(enhanced.marketOpportunity.commentary).toContain(
      MOCK_ANALYSIS.marketOpportunity.commentary,
    );
  });

  it("adds web research key findings to marketOpportunity.keyFindings", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    const webFindings = enhanced.marketOpportunity.keyFindings.filter((f) =>
      f.startsWith("[Web Research]"),
    );
    expect(webFindings.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves the original marketOpportunity.keyFindings entries", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    for (const original of MOCK_ANALYSIS.marketOpportunity.keyFindings) {
      expect(enhanced.marketOpportunity.keyFindings).toContain(original);
    }
  });

  it("appends [Web Research] Competitive Landscape to companyOverview.commentary", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(enhanced.companyOverview.commentary).toContain(
      "[Web Research] Competitive Landscape:",
    );
    expect(enhanced.companyOverview.commentary).toContain("Precision Castparts");
  });

  it("preserves the original companyOverview commentary text", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(enhanced.companyOverview.commentary).toContain(
      MOCK_ANALYSIS.companyOverview.commentary,
    );
  });

  it("adds competitive landscape finding to companyOverview.keyFindings", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    const webFindings = enhanced.companyOverview.keyFindings.filter((f) =>
      f.startsWith("[Web Research]"),
    );
    expect(webFindings.length).toBeGreaterThanOrEqual(1);
  });

  it("includes source citations in the commentary", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    // Both sections should contain a Sources note
    expect(enhanced.marketOpportunity.commentary).toContain("[Sources:");
    expect(enhanced.companyOverview.commentary).toContain("[Sources:");
  });

  it("does not modify unrelated sections (financialProfile, managementTeam, etc.)", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(enhanced.financialProfile).toStrictEqual(MOCK_ANALYSIS.financialProfile);
    expect(enhanced.managementTeam).toStrictEqual(MOCK_ANALYSIS.managementTeam);
    expect(enhanced.investmentThesis).toStrictEqual(MOCK_ANALYSIS.investmentThesis);
    expect(enhanced.riskAssessment).toStrictEqual(MOCK_ANALYSIS.riskAssessment);
    expect(enhanced.dealDynamics).toStrictEqual(MOCK_ANALYSIS.dealDynamics);
  });

  it("does not modify overallScore or recommendation", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(enhanced.overallScore).toBe(MOCK_ANALYSIS.overallScore);
    expect(enhanced.recommendation).toBe(MOCK_ANALYSIS.recommendation);
  });

  it("handles empty findings gracefully — leaves sections unchanged", () => {
    const emptyFindings = parseMarketResearchResponse("No sections here.");
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, emptyFindings);
    expect(enhanced.marketOpportunity).toStrictEqual(MOCK_ANALYSIS.marketOpportunity);
    expect(enhanced.companyOverview).toStrictEqual(MOCK_ANALYSIS.companyOverview);
  });

  it("handles partial findings — only injects available data", () => {
    const partialFindings = parseMarketResearchResponse(`\
MARKET SIZE & GROWTH:
Market is $5B growing at 4% CAGR.

SOURCES:
• Source A`);

    const enhanced = injectMarketResearch(MOCK_ANALYSIS, partialFindings);

    // marketOpportunity should be enhanced (market data injected)
    expect(enhanced.marketOpportunity.commentary).toContain("[Web Research]");

    // companyOverview should be unchanged (no competitive landscape data)
    expect(enhanced.companyOverview).toStrictEqual(MOCK_ANALYSIS.companyOverview);
  });

  it("works correctly for ip_technology deal type (all 7 sections present)", () => {
    const ipAnalysis: ISTAnalysis = {
      ...MOCK_ANALYSIS,
      dealType: "ip_technology",
    };
    const enhanced = injectMarketResearch(ipAnalysis, fullFindings);
    expect(enhanced.dealType).toBe("ip_technology");
    expect(enhanced.marketOpportunity.commentary).toContain("[Web Research]");
    expect(enhanced.companyOverview.commentary).toContain("[Web Research]");
  });
});
