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

// ---------------------------------------------------------------------------
// Demo data — IP / Technology Commercialization track
// ---------------------------------------------------------------------------

const DEMO_IP_ANALYSIS: ISTAnalysis = {
  companyName: "NovaPhoLaser IP Portfolio",
  analysisDate: "2026-03-15",
  dealType: "ip_technology",
  companyOverview: {
    sectionName: "Company Overview",
    score: 7,
    commentary:
      "NovaPhoLaser's fiber-optic sensing technology originated from a $120M DARPA-funded research programme at a Fortune 100 aerospace division. The IP package comprises 42 granted patents, 18 pending applications, and comprehensive trade-secret documentation.",
    keyFindings: [
      "42 granted patents across US, EU, and Japan",
      "18 pending applications covering next-generation sensing arrays",
      "Originated from $120M DARPA-funded research — military-grade validation",
      "Seller: Fortune 100 aerospace company executing non-core IP divestiture",
    ],
  },
  marketOpportunity: {
    sectionName: "Market Opportunity",
    score: 8,
    commentary:
      "The global fiber-optic sensing market is valued at $3.8B and growing at 12% CAGR, driven by industrial automation, structural health monitoring, and perimeter security applications. Orthogonal markets (medical diagnostics, autonomous vehicles) add $22B+ in adjacent TAM.",
    keyFindings: [
      "Primary market: $3.8B fiber-optic sensing at 12% CAGR",
      "Industrial automation segment alone: $1.4B by 2028",
      "Adjacent TAM (medical + automotive): $22B+ combined",
      "Regulatory tailwinds: infrastructure monitoring mandates in EU and US",
    ],
  },
  financialProfile: {
    sectionName: "Financial Profile",
    score: 5,
    commentary:
      "No current revenue — pre-commercialization stage. Licensing income of $2.1M/year from three early adopters. Estimated commercialization capex: $18M over 36 months. Royalty rate benchmarking suggests $8–14M/year at scale.",
    keyFindings: [
      "Current licensing revenue: $2.1M/year (3 licensees)",
      "Commercialization capex estimate: $18M over 36 months",
      "Projected royalty income at scale: $8–14M/year",
      "No debt; IP valuation supported by comparable patent transactions",
    ],
  },
  managementTeam: {
    sectionName: "Management Team",
    score: 6,
    commentary:
      "Lead inventor (Dr. Patel) has agreed to a 3-year consulting arrangement. No existing commercial team — go-to-market execution will require hiring a VP of Business Development and two applications engineers within Year 1.",
    keyFindings: [
      "Lead inventor available for 3-year consulting engagement",
      "GP-level hiring needed: VP Business Development, 2 applications engineers",
      "Advisory board includes ex-CEO of a $500M photonics company",
      "No existing sales or customer success infrastructure",
    ],
  },
  investmentThesis: {
    sectionName: "Investment Thesis",
    score: 8,
    commentary:
      "Core thesis: acquire proven, defence-validated sensing IP and commercialise across three orthogonal verticals (industrial automation, structural health monitoring, medical diagnostics). Portfolio approach de-risks reliance on any single application.",
    keyFindings: [
      "Defence validation substantially de-risks core technology claims",
      "Three identified commercialization verticals with independent revenue streams",
      "Patent moat provides 12+ years of defensible IP runway",
      "Comparable photonics IP transactions: 3–5x revenue multiple on projected royalties",
    ],
  },
  riskAssessment: {
    sectionName: "Risk Assessment",
    score: 5,
    commentary:
      "Primary risks are commercialization execution (no existing sales infrastructure), regulatory pathway uncertainty for medical application, and potential freedom-to-operate challenges in the EU. Technology risk is low given TRL 7 status.",
    keyFindings: [
      "Commercialization execution risk: no existing sales team or channel",
      "Medical application regulatory pathway: 18–24 month FDA clearance process",
      "Freedom to operate: 2 EU competitor patents require monitoring",
      "Technology risk: LOW — TRL 7, validated in operational environment",
    ],
  },
  dealDynamics: {
    sectionName: "Deal Dynamics",
    score: 6,
    commentary:
      "Proprietary process — no known competing bidders. Seller (Fortune 100 aerospace) motivated by strategic portfolio cleanup; asking price of $28M for full IP assignment. Structure flexibility available (licensing vs. full assignment).",
    keyFindings: [
      "Proprietary process: no known competing bidders",
      "Asking price: $28M (full IP assignment including patent portfolio + trade secrets)",
      "Alternative structure: exclusive worldwide licensing at $4M/year + royalties",
      "Seller timeline: 90-day close preferred; flexibility available",
    ],
  },
  // IP / Technology Track Sections (PRD §3.4)
  technologyReadiness: {
    sectionName: "Technology Readiness",
    score: 8,
    trlLevel: 7,
    commentary:
      "The core fiber-optic sensing array has been validated at TRL 7 — prototype demonstrated in the operational environment of a military aircraft wing during a DARPA programme. Manufacturing scale-up plan exists; remaining work is production hardening and cost-down.",
    keyFindings: [
      "TRL 7: System prototype demonstrated in operational (military aircraft) environment",
      "12-month programme to reach TRL 8 (production qualification)",
      "Manufacturing partner identified: Tier-2 photonics fab in Pennsylvania",
      "Bill of materials cost-down target: 40% reduction at production volume",
      "Time-to-market estimate: 18–24 months for industrial automation vertical",
    ],
  },
  ipStrengthDefensibility: {
    sectionName: "IP Strength & Defensibility",
    score: 8,
    commentary:
      "The portfolio is exceptionally well-structured: 42 granted patents with broad independent claims, no licensing encumbrances, and freedom-to-operate confirmed in the US and Japan. EU has 2 competitor patents that require monitoring but do not block the core claims.",
    keyFindings: [
      "42 granted patents: US (28), EU (8), Japan (6) — remaining life 12–17 years",
      "18 pending applications covering next-generation sensing configurations",
      "No licensing encumbrances or revenue-sharing obligations",
      "Freedom to operate: confirmed US and Japan; EU monitoring advised",
      "Trade secrets: 340-page technical documentation package included",
      "Competitor IP landscape: 2 EU patents require monitoring (non-blocking to core claims)",
    ],
  },
  commercializationPathway: {
    sectionName: "Commercialization Pathway",
    score: 7,
    commentary:
      "Clear phased approach: Year 1 targets the industrial automation OEM market via direct licensing; Year 2 expands into structural health monitoring through a distribution partnership; Year 3 initiates FDA submission for the medical diagnostics application.",
    phaseTimeline: [
      "Phase 1 (Months 1–12): Hire BD team; close 3 industrial OEM licensing agreements; target $3M ARR",
      "Phase 2 (Months 13–24): Launch structural health monitoring vertical via Acuity Systems partnership; target $6M ARR",
      "Phase 3 (Months 25–36): File FDA 510(k) for medical diagnostics application; initiate JV discussions with diagnostics OEM",
      "Phase 4 (Months 37–48): International expansion (EU, Japan); target $14M ARR",
    ],
    keyFindings: [
      "Distribution partner for structural monitoring identified: Acuity Systems ($280M revenue)",
      "3 industrial OEM LOIs in hand — addressable contracts worth $4.2M ARR",
      "FDA regulatory pathway: 510(k) (predicate-based); estimated 18-month process",
      "Pricing model: upfront licensing fee ($250K–$500K) + 4–6% royalty on product revenue",
    ],
  },
  orthogonalApplicationPotential: {
    sectionName: "Orthogonal Application Potential",
    score: 9,
    commentary:
      "This is a core Catalyze thesis play: technology developed for military aerospace sensing has three credible, independent commercial applications across different buyer verticals. Each application is independently viable and does not require the others to succeed.",
    adjacentMarkets: [
      {
        market: "Industrial Automation & Robotics",
        tamEstimate: "$1.4B by 2028 (14% CAGR)",
        rationale:
          "High-precision distance and vibration sensing is critical for next-generation robotic arms and CNC equipment. The technology outperforms incumbent laser interferometry at 1/3 the unit cost — validated in a GM pilot programme.",
      },
      {
        market: "Structural Health Monitoring",
        tamEstimate: "$890M by 2027 (11% CAGR)",
        rationale:
          "EU and US bridge/pipeline inspection mandates are driving demand for embedded sensing solutions. The fiber-optic array can be embedded in carbon fibre composites at manufacturing time — a capability no incumbent currently offers.",
      },
      {
        market: "Medical Diagnostics (Non-Invasive)",
        tamEstimate: "$2.1B by 2029 (18% CAGR)",
        rationale:
          "Sub-millimetre sensing resolution enables non-invasive blood glucose monitoring — a $2.1B market with no FDA-cleared optical solution. University of Michigan preliminary clinical data is available in the IP package.",
      },
    ],
    keyFindings: [
      "Three independent application verticals — failure of one does not impair the others",
      "GM pilot (industrial): 22% cycle-time improvement vs. incumbent laser systems",
      "EU bridge inspection mandate (structural): €4B procurement cycle beginning 2027",
      "University of Michigan clinical data included in the IP package (medical)",
    ],
  },
  overallScore: 7.4,
  recommendation: "conditional_proceed",
  executiveSummary:
    "NovaPhoLaser represents a compelling IP commercialization opportunity: a TRL 7 fiber-optic sensing technology with strong patent protection, a clear three-vertical commercialization roadmap, and three independently viable adjacent markets totalling $4.4B in TAM. The primary execution risk is building the commercial infrastructure from scratch, which is mitigated by the lead inventor's consulting commitment, an identified manufacturing partner, and three industrial OEM LOIs. At the asking price of $28M for full IP assignment, entry is supported by comparable photonics patent transactions and projected royalty income of $8–14M/year at scale.",
};

const DEMO_SCORING_RESULT: ScoringResult = scoreAnalysis(DEMO_ANALYSIS, {
  weights: DEFAULT_WEIGHTS,
});

const DEMO_IP_SCORING_RESULT: ScoringResult = scoreAnalysis(DEMO_IP_ANALYSIS, {
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

  // Demo mode — used in development when Supabase is not configured.
  // Use a special sentinel ID to preview the IP/Technology track demo.
  const demoAnalysis = id === "demo-ip" ? DEMO_IP_ANALYSIS : DEMO_ANALYSIS;
  const demoScoringResult =
    id === "demo-ip" ? DEMO_IP_SCORING_RESULT : DEMO_SCORING_RESULT;
  return (
    <ScreeningResultsPage
      analysis={demoAnalysis}
      scoringResult={demoScoringResult}
      screeningId={id}
      rawDocumentText={null}
    />
  );
}
