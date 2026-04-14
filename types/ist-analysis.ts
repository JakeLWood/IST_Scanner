/**
 * IST (Investment Screening Tool) Analysis Types
 * Used across all deal-type tracks (Traditional PE, IP/Technology Commercialization, Growth Equity, etc.)
 */

/** Score range for any IST section (1–10 integer) */
export type ISTScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Scoring calibration (applies to every ISTSection.score):
 *   7–10 = Strong
 *   5–6  = Adequate
 *   3–4  = Concerning
 *   1–2  = Deal-breaking
 */
export interface ISTSection {
  /** Canonical display name for this section, e.g. "Company Overview". */
  sectionName: string;
  /** Integer score from 1 (deal-breaking) to 10 (exceptional) */
  score: ISTScore;
  /** Narrative commentary explaining the score */
  commentary: string;
  /** Bullet-point key findings that drive the score */
  keyFindings: string[];
}

// ---------------------------------------------------------------------------
// 7 IST Sections – Traditional PE Track
// ---------------------------------------------------------------------------

export interface CompanyOverview extends ISTSection {
  sectionName: "Company Overview";
}

export interface MarketOpportunity extends ISTSection {
  sectionName: "Market Opportunity";
}

export interface FinancialProfile extends ISTSection {
  sectionName: "Financial Profile";
}

export interface ManagementTeam extends ISTSection {
  sectionName: "Management Team";
}

export interface InvestmentThesis extends ISTSection {
  sectionName: "Investment Thesis";
}

export interface RiskAssessment extends ISTSection {
  sectionName: "Risk Assessment";
}

export interface DealDynamics extends ISTSection {
  sectionName: "Deal Dynamics";
}

// ---------------------------------------------------------------------------
// IP / Technology Commercialization Track Sections (PRD §3.4)
// ---------------------------------------------------------------------------

/** Single adjacent-market opportunity with a TAM estimate. */
export interface AdjacentMarket {
  /** Name of the adjacent market (e.g. "Industrial Automation"). */
  market: string;
  /** Total Addressable Market size as a human-readable string (e.g. "$4.2B by 2028"). */
  tamEstimate: string;
  /** Brief rationale for why the technology applies to this market. */
  rationale: string;
}

export interface TechnologyReadiness extends ISTSection {
  sectionName: "Technology Readiness";
  /**
   * Actual Technology Readiness Level on the NASA 1–9 scale.
   * null when not determinable from the available data.
   */
  trlLevel: number | null;
}

export interface IPStrengthDefensibility extends ISTSection {
  sectionName: "IP Strength & Defensibility";
}

export interface CommercializationPathway extends ISTSection {
  sectionName: "Commercialization Pathway";
  /**
   * Ordered list of commercialization phases/milestones
   * (e.g. "Phase 1: Pilot — Q1–Q3 Year 1").
   */
  phaseTimeline?: string[];
}

export interface OrthogonalApplicationPotential extends ISTSection {
  sectionName: "Orthogonal Application Potential";
  /** 2–3 adjacent markets with TAM estimates (PRD §3.4). */
  adjacentMarkets?: AdjacentMarket[];
}

// ---------------------------------------------------------------------------
// Aggregate recommendation
// ---------------------------------------------------------------------------

/**
 * Recommendation produced by Claude as part of the raw ISTAnalysis JSON.
 * Note: the scoring engine independently computes a FinalRecommendation
 * (PROCEED | FURTHER_REVIEW | PASS) from the section scores; this type
 * captures Claude's own assessment, which may differ.
 */
export type ISTRecommendation =
  | "proceed"
  | "conditional_proceed"
  | "pass";

// ---------------------------------------------------------------------------
// Full ISTAnalysis – the object Claude must return as JSON
// ---------------------------------------------------------------------------

/**
 * Complete Investment Screening Tool analysis.
 * Claude must return a JSON object that exactly matches this interface.
 */
export interface ISTAnalysis {
  /** Human-readable company / deal name */
  companyName: string;
  /** ISO 8601 date string (YYYY-MM-DD) when the analysis was performed */
  analysisDate: string;
  /** The deal-type track this analysis was generated under */
  dealType: "traditional_pe" | "ip_technology" | "growth_equity" | "venture" | "real_estate" | "credit";

  // --- 7 IST Sections (Traditional PE Track) ---
  companyOverview: CompanyOverview;
  marketOpportunity: MarketOpportunity;
  financialProfile: FinancialProfile;
  managementTeam: ManagementTeam;
  investmentThesis: InvestmentThesis;
  riskAssessment: RiskAssessment;
  dealDynamics: DealDynamics;

  // --- IP / Technology Commercialization Track Sections (PRD §3.4) ---
  // Present when dealType === 'ip_technology'; absent for traditional_pe.
  technologyReadiness?: TechnologyReadiness;
  ipStrengthDefensibility?: IPStrengthDefensibility;
  commercializationPathway?: CommercializationPathway;
  orthogonalApplicationPotential?: OrthogonalApplicationPotential;

  // --- Aggregate outputs ---
  /** Weighted average of all seven section scores, rounded to one decimal place */
  overallScore: number;
  /** High-level recommendation based on overall score and deal-breaker flags */
  recommendation: ISTRecommendation;
  /** 3–5 sentence executive summary suitable for IC memo cover page */
  executiveSummary: string;
}
