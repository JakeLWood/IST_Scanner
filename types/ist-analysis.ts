/**
 * IST (Investment Screening Tool) Analysis Types
 * Used across all deal-type tracks (Traditional PE, Growth Equity, etc.)
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
  dealType: "traditional_pe" | "growth_equity" | "venture" | "real_estate" | "credit";

  // --- 7 IST Sections ---
  companyOverview: CompanyOverview;
  marketOpportunity: MarketOpportunity;
  financialProfile: FinancialProfile;
  managementTeam: ManagementTeam;
  investmentThesis: InvestmentThesis;
  riskAssessment: RiskAssessment;
  dealDynamics: DealDynamics;

  // --- Aggregate outputs ---
  /** Weighted average of all seven section scores, rounded to one decimal place */
  overallScore: number;
  /** High-level recommendation based on overall score and deal-breaker flags */
  recommendation: ISTRecommendation;
  /** 3–5 sentence executive summary suitable for IC memo cover page */
  executiveSummary: string;
}
