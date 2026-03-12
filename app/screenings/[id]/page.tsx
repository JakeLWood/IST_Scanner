import { createClient } from "@/lib/supabase/server";
import type { ISTAnalysis } from "@/types/ist-analysis";
import type { ScoringResult } from "@/lib/scoringEngine";
import { DEFAULT_WEIGHTS, scoreAnalysis } from "@/lib/scoringEngine";
import ScreeningResultsPage from "./ScreeningResultsPage";

// ---------------------------------------------------------------------------
// Demo data — used when Supabase env vars are not configured
// ---------------------------------------------------------------------------

const DEMO_ANALYSIS: ISTAnalysis = {
  companyName: "Acme Industrial Holdings",
  analysisDate: "2026-03-01",
  dealType: "traditional_pe",
  companyOverview: {
    sectionName: "Company Overview",
    score: 7,
    commentary:
      "Acme Industrial is a mid-market diversified industrial manufacturer with $85M revenue and 35-year operating history. The business holds #2 market share in three niche sub-verticals with stable recurring contract revenue.",
    keyFindings: [
      "35-year operating history with no significant leadership transitions",
      "$85M revenue with 68% recurring contract base",
      "#2 market position in niche auto-parts and heavy-equipment sub-segments",
      "Owner-operator led with full management team in place",
    ],
  },
  marketOpportunity: {
    sectionName: "Market Opportunity",
    score: 6,
    commentary:
      "The addressable market is $2.1B growing at ~3% CAGR. While not a high-growth sector, the niche sub-verticals show defensible characteristics. Near-term headwinds from inventory normalisation in the automotive channel present some uncertainty.",
    keyFindings: [
      "$2.1B TAM with 3% CAGR — GDP+ growth",
      "Niche auto-parts segment facing inventory normalisation headwind (12–18 month cycle)",
      "Significant white-space opportunity in adjacent geographic markets",
    ],
  },
  financialProfile: {
    sectionName: "Financial Profile",
    score: 5,
    commentary:
      "EBITDA margins of 14% are below peers (18–22%) due to legacy plant inefficiencies. Revenue has grown 6% YoY. Working capital management is adequate. Net Debt / EBITDA of 2.8x is manageable at current interest rates.",
    keyFindings: [
      "EBITDA margin: 14% vs. peer range 18–22% — operational improvement potential",
      "6% YoY revenue growth on organic basis",
      "Net Debt / EBITDA: 2.8x (pro forma post-transaction at 4.2x)",
      "Free cash flow conversion: 78% of EBITDA",
    ],
  },
  managementTeam: {
    sectionName: "Management Team",
    score: 7,
    commentary:
      "CEO has 22 years tenure; CFO joined 4 years ago from Big 4 and has implemented modernised reporting. COO background in lean manufacturing is a key value creation lever. Team has successfully managed two prior strategic acquisitions.",
    keyFindings: [
      "CEO: 22 years tenure, deep customer relationships",
      "CFO: Big 4 background, modernised ERP and financial reporting",
      "COO: Lean manufacturing expertise — EBITDA margin expansion driver",
      "Two prior bolt-on acquisitions successfully integrated",
    ],
  },
  investmentThesis: {
    sectionName: "Investment Thesis",
    score: 7,
    commentary:
      "Core thesis centres on operational improvement (margin expansion from 14% to 18–20%), geographic expansion into two adjacent markets, and two to three bolt-on acquisitions in the fragmented sub-vertical. Target IRR: 22–26% over 5-year hold.",
    keyFindings: [
      "Operational leverage: plant consolidation targets +400–600 bps EBITDA improvement",
      "Geographic expansion: two adjacent markets with established distributor relationships",
      "Bolt-on pipeline: 4 identified targets, 2 at LOI stage",
      "Exit multiple expansion potential as business scales past $150M revenue",
    ],
  },
  riskAssessment: {
    sectionName: "Risk Assessment",
    score: 4,
    commentary:
      "Key risks include automotive channel concentration (42% of revenue), execution risk on plant consolidation, and interest rate sensitivity at 4.2x leverage. Climate transition risk to internal combustion engine parts is a 5–7 year horizon concern.",
    keyFindings: [
      "Customer concentration: top 3 customers = 38% of revenue",
      "Automotive channel exposure: 42% of revenue in cyclical segment",
      "Plant consolidation execution risk: 18-month programme, $8M one-time cost",
      "EV transition tail risk on ICE-related parts (5–7 year horizon)",
      "Interest rate sensitivity at 4.2x pro-forma leverage",
    ],
  },
  dealDynamics: {
    sectionName: "Deal Dynamics",
    score: 6,
    commentary:
      "Asking price of 8.5x EBITDA is in line with sector comps. Competitive process with 3 known bidders. Seller motivated by retirement — no rollover equity expected. 90-day exclusivity window available if indicative offer submitted by month-end.",
    keyFindings: [
      "Asking 8.5x EBITDA — sector comps 7.5–9.5x; entry at 8.0x achievable",
      "Competitive process: 3 known financial sponsors in process",
      "Seller motivation: retirement — full exit preferred, no rollover",
      "90-day exclusivity on offer submission by March 31, 2026",
      "Management incentive package needs to be structured pre-close",
    ],
  },
  overallScore: 6.0,
  recommendation: "conditional_proceed",
  executiveSummary:
    "Acme Industrial Holdings represents a solid mid-market industrial platform with a defensible market position, experienced management team, and clear operational improvement levers. The key risk factors — customer concentration, automotive channel cyclicality, and elevated post-transaction leverage — require careful diligence and structuring. Subject to confirmatory financial diligence and satisfactory resolution of the plant consolidation timeline, this opportunity warrants progression to a formal Letter of Intent.",
};

const DEMO_SCORING_RESULT: ScoringResult = scoreAnalysis(DEMO_ANALYSIS, {
  weights: DEFAULT_WEIGHTS,
});

// ---------------------------------------------------------------------------
// Type for the screenings row from Supabase
// ---------------------------------------------------------------------------

type ScreeningRow = {
  id: string;
  company_name: string;
  composite_score: number | null;
  recommendation: "PROCEED" | "FURTHER_REVIEW" | "PASS" | null;
  ai_response_json: ISTAnalysis | null;
  scores_json: ScoringResult | null;
  raw_document_text: string | null;
  is_disqualified: boolean;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Attempt to load a screening from Supabase; returns null on any failure. */
async function loadScreening(id: string): Promise<{
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  rawDocumentText: string | null;
} | null> {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("screenings")
      .select(
        "id, company_name, composite_score, recommendation, ai_response_json, scores_json, raw_document_text, is_disqualified"
      )
      .eq("id", id)
      .single<ScreeningRow>();

    if (error || !data || !data.ai_response_json) return null;

    const analysis = data.ai_response_json;

    let scoringResult: ScoringResult;
    if (data.scores_json && data.composite_score !== null) {
      scoringResult = {
        ...data.scores_json,
        compositeScore: data.composite_score,
        recommendation: data.recommendation ?? "FURTHER_REVIEW",
        isDisqualified: data.is_disqualified,
      };
    } else {
      scoringResult = scoreAnalysis(analysis, { weights: DEFAULT_WEIGHTS });
    }

    return { analysis, scoringResult, rawDocumentText: data.raw_document_text };
  } catch {
    return null;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const live = await loadScreening(id);
  if (live) {
    return (
      <ScreeningResultsPage
        analysis={live.analysis}
        scoringResult={live.scoringResult}
        screeningId={id}
        rawDocumentText={live.rawDocumentText}
      />
    );
  }

  // Demo mode — used in development when Supabase is not configured
  return (
    <ScreeningResultsPage
      analysis={DEMO_ANALYSIS}
      scoringResult={DEMO_SCORING_RESULT}
      screeningId={id}
      rawDocumentText={null}
    />
  );
}
