/**
 * Unit tests for PRD §8.3 Market Research Enhancement helpers.
 *
 * Covers:
 *   - buildMarketResearchPrompt   — prompt content and search query injection
 *   - parseMarketResearchResponse — structured section extraction
 *   - injectMarketResearch        — injection into ISTAnalysis (PRD §5.4 schema)
 *                                   with [Web Research] strength entries
 */

import { describe, it, expect } from "vitest";
import type { ISTAnalysis } from "@/types/ist";
import {
  buildMarketResearchPrompt,
  parseMarketResearchResponse,
  injectMarketResearch,
  MARKET_RESEARCH_SYSTEM_PROMPT,
} from "@/lib/marketResearch";

// ---------------------------------------------------------------------------
// Shared test fixtures — use PRD §5.4 ISTAnalysis format (types/ist.ts)
// ---------------------------------------------------------------------------

const MOCK_ANALYSIS: ISTAnalysis = {
  schema_version: "1.0",
  generated_at: "2026-04-17T00:00:00.000Z",
  company_name: "Apex Industrial Holdings",
  deal_type: "traditional_pe",
  snapshot: {
    company_name: "Apex Industrial Holdings",
    industry: "Aerospace Fastener Manufacturing",
    location: "Los Angeles, CA",
    transaction_type: "100% Acquisition",
    revenue: 90000000,
    ebitda: 16200000,
    ebitda_margin: 18,
    revenue_growth_rate: 8,
    asking_price: 145800000,
    ev_ebitda_multiple: 9,
    employee_count: 350,
    year_founded: 1991,
    deal_source: "Investment Bank",
    customer_concentration_pct: 45,
  },
  strengths: [
    {
      category: "Market Position",
      title: "35-Year Defensible Aerospace Niche",
      description:
        "Apex has supplied precision fasteners to Boeing, Airbus, and Lockheed for 35 years.",
      supporting_data: [
        "35-year operating history with FAA-certified production lines",
        "$90M TTM revenue",
      ],
    },
    {
      category: "Financial Profile",
      title: "Above-Peer EBITDA Margins",
      description: "Margins of 18% significantly exceed the peer average of 14%.",
      supporting_data: ["18% EBITDA margin vs. 14% peer average"],
    },
  ],
  risks: [
    {
      risk: "Customer concentration",
      severity: "Medium",
      mitigation: "Long-term OEM supply agreements reduce churn risk",
      evidence: "Top 3 customers = 45% of revenue per CIM data",
    },
  ],
  value_creation: {
    near_term: [
      {
        initiative: "Expand into defense MRO",
        ebitda_impact_low: 1500000,
        ebitda_impact_high: 2500000,
        investment_required: 300000,
        timeline: "Year 1",
      },
    ],
    medium_term: [
      {
        initiative: "Bolt-on acquisition of regional competitor",
        ebitda_impact_low: 2000000,
        ebitda_impact_high: 4000000,
        investment_required: null,
        timeline: "Year 2–3",
      },
    ],
    exit_positioning: [
      {
        initiative: "Strategic sale to TransDigm or HEICO",
        ebitda_impact_low: null,
        ebitda_impact_high: null,
        investment_required: null,
        timeline: "Year 4–5",
      },
    ],
  },
  scores: [
    {
      dimension: "market_attractiveness",
      score: 7,
      justification:
        "The global aerospace fastener market is $12B with favorable secular tailwinds from commercial aviation recovery.",
      data_gaps: [],
    },
    {
      dimension: "competitive_position",
      score: 7,
      justification:
        "Strong switching costs via FAA certifications and 35-year OEM relationships.",
      data_gaps: [],
    },
    {
      dimension: "financial_quality",
      score: 6,
      justification: "EBITDA margins of 18% are in line with peers.",
      data_gaps: [],
    },
    {
      dimension: "management_team",
      score: 7,
      justification: "CEO has 22-year tenure; leadership team is experienced.",
      data_gaps: [],
    },
    {
      dimension: "value_creation_potential",
      score: 7,
      justification: "Clear buy-and-build platform opportunity in fragmented market.",
      data_gaps: [],
    },
    {
      dimension: "risk_profile",
      score: 6,
      justification: "Customer concentration risk manageable via long-term contracts.",
      data_gaps: [],
    },
    {
      dimension: "valuation_attractiveness",
      score: 6,
      justification: "Entry at 9x EV/EBITDA is in line with comparable transactions.",
      data_gaps: [],
    },
  ],
  recommendation: {
    verdict: "FURTHER_REVIEW",
    reasoning: [
      "Strong aerospace niche with defensible market position",
      "Customer concentration warrants further diligence on contract terms",
      "Valuation is fair but not compelling relative to peers",
    ],
    suggested_loi_terms: null,
    disqualifying_factors: null,
  },
  key_questions: [
    {
      question: "What is the weighted average remaining contract length for the top 3 customers?",
      validates: "Customer concentration risk (Medium severity)",
    },
    {
      question: "How many qualified backup suppliers exist for proprietary alloys?",
      validates: "Supply chain risk",
    },
    {
      question: "What is the capex requirement to expand defense MRO capacity?",
      validates: "Value creation — defense MRO expansion",
    },
    {
      question: "Has an FTO analysis been conducted for key patents?",
      validates: "IP defensibility",
    },
    {
      question: "What is the CEO succession plan post-acquisition?",
      validates: "Key-person dependency risk",
    },
  ],
  data_quality: {
    completeness_pct: 80,
    missing_critical_fields: ["backlog_size", "capex_intensity"],
    caveats: ["Financials are management-prepared; QoE not yet completed"],
  },
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
    const originalStrengthCount = MOCK_ANALYSIS.strengths.length;
    injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(MOCK_ANALYSIS.strengths.length).toBe(originalStrengthCount);
  });

  it("adds a [Web Research] strength entry to the strengths array", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    const webStrength = enhanced.strengths.find(
      (s) => s.category === "[Web Research]",
    );
    expect(webStrength).toBeDefined();
  });

  it("includes Market Size & Growth finding in [Web Research] supporting_data", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    const webStrength = enhanced.strengths.find(
      (s) => s.category === "[Web Research]",
    );
    const hasMktGrowth = webStrength?.supporting_data.some((d) =>
      d.includes("[Web Research] Market Size & Growth:") && d.includes("$12.4B"),
    );
    expect(hasMktGrowth).toBe(true);
  });

  it("includes Comparable Transactions finding in [Web Research] supporting_data", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    const webStrength = enhanced.strengths.find(
      (s) => s.category === "[Web Research]",
    );
    const hasTransactions = webStrength?.supporting_data.some((d) =>
      d.includes("[Web Research] Comparable Transactions:") &&
      d.includes("9–11x EV/EBITDA"),
    );
    expect(hasTransactions).toBe(true);
  });

  it("includes Competitive Landscape finding in [Web Research] supporting_data", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    const webStrength = enhanced.strengths.find(
      (s) => s.category === "[Web Research]",
    );
    const hasCompetitive = webStrength?.supporting_data.some((d) =>
      d.includes("[Web Research] Competitive Landscape:") &&
      d.includes("Precision Castparts"),
    );
    expect(hasCompetitive).toBe(true);
  });

  it("preserves all original strengths entries", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    for (const original of MOCK_ANALYSIS.strengths) {
      expect(
        enhanced.strengths.some((s) => s.title === original.title),
      ).toBe(true);
    }
  });

  it("includes source citations in the [Web Research] strength description", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    const webStrength = enhanced.strengths.find(
      (s) => s.category === "[Web Research]",
    );
    expect(webStrength?.description).toContain("[Sources:");
  });

  it("appends web research findings to data_quality.caveats", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    const hasCaveat = enhanced.data_quality.caveats.some((c) =>
      c.includes("[Web Research]"),
    );
    expect(hasCaveat).toBe(true);
  });

  it("preserves original data_quality.caveats", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    for (const caveat of MOCK_ANALYSIS.data_quality.caveats) {
      expect(enhanced.data_quality.caveats).toContain(caveat);
    }
  });

  it("does not modify scores, recommendation, or snapshot", () => {
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, fullFindings);
    expect(enhanced.scores).toStrictEqual(MOCK_ANALYSIS.scores);
    expect(enhanced.recommendation).toStrictEqual(MOCK_ANALYSIS.recommendation);
    expect(enhanced.snapshot).toStrictEqual(MOCK_ANALYSIS.snapshot);
  });

  it("handles empty findings gracefully — leaves strengths unchanged", () => {
    const emptyFindings = parseMarketResearchResponse("No sections here.");
    const enhanced = injectMarketResearch(MOCK_ANALYSIS, emptyFindings);
    expect(enhanced.strengths).toStrictEqual(MOCK_ANALYSIS.strengths);
    expect(enhanced.data_quality.caveats).toStrictEqual(
      MOCK_ANALYSIS.data_quality.caveats,
    );
  });

  it("handles partial findings — only injects available data into supporting_data", () => {
    const partialFindings = parseMarketResearchResponse(`\
MARKET SIZE & GROWTH:
Market is $5B growing at 4% CAGR.

SOURCES:
• Source A`);

    const enhanced = injectMarketResearch(MOCK_ANALYSIS, partialFindings);
    const webStrength = enhanced.strengths.find(
      (s) => s.category === "[Web Research]",
    );
    // Only market size entry should be present (no transactions or competitive)
    expect(webStrength?.supporting_data).toHaveLength(1);
    expect(webStrength?.supporting_data[0]).toContain("Market Size & Growth");
  });

  it("works correctly for ip_technology deal type", () => {
    const ipAnalysis: ISTAnalysis = {
      ...MOCK_ANALYSIS,
      deal_type: "ip_technology",
    };
    const enhanced = injectMarketResearch(ipAnalysis, fullFindings);
    expect(enhanced.deal_type).toBe("ip_technology");
    const webStrength = enhanced.strengths.find(
      (s) => s.category === "[Web Research]",
    );
    expect(webStrength).toBeDefined();
  });
});

