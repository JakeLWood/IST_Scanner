/**
 * Market Research Enhancement — PRD §8.3
 *
 * Pure helper functions for the market research second-pass Claude call.
 * These functions are kept framework-agnostic so they can be used by both
 * the Supabase Edge Function (Deno) and the Vitest test suite (Node).
 *
 * Exports:
 *   buildMarketResearchPrompt()    – constructs the user-turn prompt
 *   parseMarketResearchResponse()  – parses Claude's structured text reply
 *   injectMarketResearch()         – merges findings into an ISTAnalysis
 *   MARKET_RESEARCH_SYSTEM_PROMPT  – static system prompt for the research call
 */

import type { ISTAnalysis } from "../types/ist-analysis";

// ---------------------------------------------------------------------------
// System prompt for the market research Claude call
// ---------------------------------------------------------------------------

export const MARKET_RESEARCH_SYSTEM_PROMPT = `\
You are a market research specialist supporting a private equity firm's deal screening \
process. Your role is to use web search to find current, factual market data that \
supplements the firm's analysis. Be precise with numbers, cite sources explicitly, and \
keep findings concise. Focus on data directly relevant to investment decision-making: \
market size, growth rates, recent transaction multiples, and competitive dynamics.

When asked to search, always search for all three topics requested. Present each \
finding with specific data points wherever possible, and always note your sources.`;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the user-turn prompt for the market research Claude call.
 *
 * @param companyName     - Name of the company being analyzed.
 * @param industryContext - Brief text excerpt from the initial analysis that
 *                         conveys the industry/sector (e.g. first 250 chars of
 *                         marketOpportunity.commentary + companyOverview.commentary).
 * @param currentYear     - Four-digit year string (e.g. "2025").
 */
export function buildMarketResearchPrompt(
  companyName: string,
  industryContext: string,
  currentYear: string,
): string {
  return `\
Using web search, find current market data to supplement a private equity deal analysis.

Company being analyzed: "${companyName}"

Industry context from the deal analysis:
${industryContext}

Please search for and summarize the following. For each topic include specific data \
points (numbers, percentages, deal sizes) and cite your sources inline.

1. MARKET SIZE & GROWTH
   Search for "[industry] market size CAGR 2024" where [industry] is the relevant \
sector inferred from the context above. Summarize: current market size, CAGR, and \
key growth drivers or headwinds.

2. COMPARABLE M&A TRANSACTIONS
   Search for "comparable M&A transactions [sector] ${currentYear}" and the prior \
two years. Summarize: recent deal multiples (EV/EBITDA), deal sizes, and notable \
strategic rationale.

3. COMPETITIVE LANDSCAPE
   Search for "${companyName} competitors". Identify: key competitors, relative \
market positions, and any competitive dynamics relevant to this investment.

Structure your response EXACTLY using these section headers (all caps, followed by a \
colon and a newline):

MARKET SIZE & GROWTH:
[2–3 sentences with specific numbers and inline source citations]

COMPARABLE TRANSACTIONS:
[2–3 sentences with specific multiples/sizes and inline source citations]

COMPETITIVE LANDSCAPE:
[2–3 sentences identifying key players and dynamics with inline source citations]

SOURCES:
[List every source used, one per line, prefixed with a bullet •]

Keep each section to 2–3 concise sentences. Do not add any extra sections.`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * Structured findings extracted from Claude's market research response.
 */
export interface MarketResearchFindings {
  /** Findings about market size and CAGR. Empty string when not found. */
  marketAndGrowth: string;
  /** Findings about comparable M&A transactions. Empty string when not found. */
  comparableTransactions: string;
  /** Findings about the competitive landscape. Empty string when not found. */
  competitiveLandscape: string;
  /** Source citations extracted from the SOURCES section. */
  sources: string[];
}

/**
 * Parses Claude's structured text response into discrete research findings.
 * Gracefully handles missing sections by returning empty strings.
 *
 * @param text - The raw text content returned by Claude.
 */
export function parseMarketResearchResponse(text: string): MarketResearchFindings {
  const findings: MarketResearchFindings = {
    marketAndGrowth: "",
    comparableTransactions: "",
    competitiveLandscape: "",
    sources: [],
  };

  // Extract each section using regex so the order of sections in the text
  // does not matter and extra whitespace is tolerated.
  const marketMatch = text.match(
    /MARKET SIZE & GROWTH:\s*([\s\S]*?)(?=COMPARABLE TRANSACTIONS:|COMPETITIVE LANDSCAPE:|SOURCES:|$)/i,
  );
  const transactionsMatch = text.match(
    /COMPARABLE TRANSACTIONS:\s*([\s\S]*?)(?=MARKET SIZE & GROWTH:|COMPETITIVE LANDSCAPE:|SOURCES:|$)/i,
  );
  const competitiveMatch = text.match(
    /COMPETITIVE LANDSCAPE:\s*([\s\S]*?)(?=MARKET SIZE & GROWTH:|COMPARABLE TRANSACTIONS:|SOURCES:|$)/i,
  );
  const sourcesMatch = text.match(
    /SOURCES:\s*([\s\S]*?)(?=MARKET SIZE & GROWTH:|COMPARABLE TRANSACTIONS:|COMPETITIVE LANDSCAPE:|$)/i,
  );

  if (marketMatch) findings.marketAndGrowth = marketMatch[1].trim();
  if (transactionsMatch) findings.comparableTransactions = transactionsMatch[1].trim();
  if (competitiveMatch) findings.competitiveLandscape = competitiveMatch[1].trim();

  if (sourcesMatch) {
    findings.sources = sourcesMatch[1]
      .trim()
      .split("\n")
      .map((line) => line.replace(/^[•\-*]\s*/, "").trim())
      .filter(Boolean);
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Injector
// ---------------------------------------------------------------------------

/**
 * Injects web research findings into the relevant ISTAnalysis sections.
 *
 * Per PRD §8.3:
 *   - Market size / CAGR + comparable transactions → `marketOpportunity`
 *     (the "Market Attractiveness" dimension)
 *   - Competitive landscape → `companyOverview`
 *     (the "Competitive Position" dimension)
 *
 * All injected text is prefixed with [Web Research] and includes source
 * citations.  The original commentary is preserved unchanged; findings are
 * appended with a blank-line separator.
 *
 * @param analysis  - The validated ISTAnalysis produced by the initial call.
 * @param findings  - Structured findings returned by parseMarketResearchResponse.
 * @returns A new ISTAnalysis object with web research injected; the original
 *          object is never mutated.
 */
export function injectMarketResearch(
  analysis: ISTAnalysis,
  findings: MarketResearchFindings,
): ISTAnalysis {
  // Work on a shallow copy so the caller's object is not mutated.
  const enhanced: ISTAnalysis = { ...analysis };

  // ── Market Opportunity section (Market Attractiveness) ───────────────────
  const marketInserts: string[] = [];

  if (findings.marketAndGrowth) {
    marketInserts.push(
      `[Web Research] Market Size & Growth: ${findings.marketAndGrowth}`,
    );
  }
  if (findings.comparableTransactions) {
    marketInserts.push(
      `[Web Research] Comparable Transactions: ${findings.comparableTransactions}`,
    );
  }

  if (marketInserts.length > 0) {
    const sourcesNote = buildSourcesNote(findings.sources, 3);
    enhanced.marketOpportunity = {
      ...analysis.marketOpportunity,
      commentary:
        analysis.marketOpportunity.commentary +
        "\n\n" +
        marketInserts.join("\n\n") +
        sourcesNote,
      keyFindings: [
        ...analysis.marketOpportunity.keyFindings,
        ...marketInserts,
      ],
    };
  }

  // ── Company Overview section (Competitive Position) ──────────────────────
  if (findings.competitiveLandscape) {
    const competitiveInsert = `[Web Research] Competitive Landscape: ${findings.competitiveLandscape}`;
    const sourcesNote = buildSourcesNote(findings.sources, 2);
    enhanced.companyOverview = {
      ...analysis.companyOverview,
      commentary:
        analysis.companyOverview.commentary +
        "\n\n" +
        competitiveInsert +
        sourcesNote,
      keyFindings: [
        ...analysis.companyOverview.keyFindings,
        competitiveInsert,
      ],
    };
  }

  return enhanced;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Formats up to `maxSources` source citations as an inline parenthetical.
 * Returns an empty string when `sources` is empty.
 */
function buildSourcesNote(sources: string[], maxSources: number): string {
  if (sources.length === 0) return "";
  const cited = sources.slice(0, maxSources).join("; ");
  return ` [Sources: ${cited}]`;
}
