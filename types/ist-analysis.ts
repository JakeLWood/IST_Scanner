// IST (Investment Screening Tool) Analysis Types

export type DealType =
  | "traditional_pe"
  | "growth_equity"
  | "venture"
  | "real_estate"
  | "credit"
  | "ip_technology";

export type RecommendationVerdict = "PROCEED" | "FURTHER_REVIEW" | "PASS";

export type Severity = "low" | "medium" | "high" | "critical";
export type Likelihood = "low" | "medium" | "high";
export type Significance = "low" | "medium" | "high";
export type TimeFrame = "short" | "medium" | "long";
export type Priority = "low" | "medium" | "high";

export interface ISTStrength {
  title: string;
  description: string;
  significance: Significance;
}

export interface ISTRisk {
  title: string;
  description: string;
  severity: Severity;
  likelihood: Likelihood;
  mitigation?: string;
}

export interface ISTValueCreation {
  title: string;
  description: string;
  timeframe: TimeFrame;
  potential: Significance;
}

export interface ISTScore {
  /** Composite 0-100 score */
  overall: number;
  market: number;
  management: number;
  financials: number;
  strategic_fit: number;
  /** Only populated for ip_technology deals */
  ip_technology: number | null;
}

export interface ISTRecommendation {
  verdict: RecommendationVerdict;
  summary: string;
  conditions: string[];
  has_disqualifier: boolean;
  disqualifier_reason?: string;
}

export interface ISTKeyQuestion {
  question: string;
  rationale: string;
  priority: Priority;
  owner?: string;
}

export interface ISTDataQuality {
  confidence: "low" | "medium" | "high";
  completeness_pct: number;
  missing_data: string[];
  caveats: string[];
}

export interface ISTSnapshotMetrics {
  revenue_usd?: number;
  ebitda_usd?: number;
  ebitda_margin_pct?: number;
  revenue_growth_pct?: number;
  enterprise_value_usd?: number;
  ev_revenue_multiple?: number;
  ev_ebitda_multiple?: number;
  debt_to_ebitda?: number;
  irr_target_pct?: number;
  moic_target?: number;
}

export interface ISTAnalysis {
  schema_version: string;
  generated_at: string;
  company_name: string;
  deal_type: DealType;
  executive_summary: string;
  strengths: ISTStrength[];
  risks: ISTRisk[];
  value_creation: ISTValueCreation[];
  score: ISTScore;
  recommendation: ISTRecommendation;
  key_questions: ISTKeyQuestion[];
  data_quality: ISTDataQuality;
  snapshot_metrics?: ISTSnapshotMetrics;
  raw_document?: string;
}

export interface ISTSnapshot {
  id: string;
  screening_id: string;
  version: number;
  analysis: ISTAnalysis;
  model_id: string;
  tokens_used: number;
  cost_usd: number;
  created_at: string;
}

export interface ISTScreening {
  id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  company_name: string;
  deal_type: DealType;
  status: "pending" | "processing" | "complete" | "failed";
  latest_analysis: ISTAnalysis | null;
  snapshots: ISTSnapshot[];
  reviewer_notes?: string;
}
