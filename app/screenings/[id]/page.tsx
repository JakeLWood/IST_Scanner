import { notFound } from "next/navigation";
import type { ISTAnalysis } from "@/types/ist-analysis";
import ScreeningResultsPage from "./ScreeningResultsPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Fetch screening data from Supabase (or return demo data when env vars are
 * not configured so the page is usable in development without a database).
 */
async function getScreening(id: string): Promise<ISTAnalysis | null> {
  // When Supabase is configured, fetch the real record.
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("screenings")
      .select("latest_analysis")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return data.latest_analysis as ISTAnalysis | null;
  }

  // --- Demo / development fallback ---
  return DEMO_ANALYSIS;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const analysis = await getScreening(id);

  if (!analysis) {
    notFound();
  }

  return <ScreeningResultsPage analysis={analysis} screeningId={id} />;
}

// ---------------------------------------------------------------------------
// Demo data (used when Supabase is not configured)
// ---------------------------------------------------------------------------
const DEMO_ANALYSIS: ISTAnalysis = {
  schema_version: "1.0",
  generated_at: "2026-03-01T14:30:00.000Z",
  company_name: "Apex Manufacturing Co.",
  deal_type: "traditional_pe",
  executive_summary:
    "Apex Manufacturing Co. is a mid-market industrial components manufacturer with strong market position in the aerospace sector. The company demonstrates robust EBITDA margins driven by proprietary process technology and long-term OEM contracts. Management has a proven track record of operational improvement, with a credible plan for geographic expansion into Southeast Asian markets. Key risks include customer concentration (top 3 customers represent 58% of revenue) and capex-intensive growth requirements.",
  score: {
    overall: 72,
    market: 78,
    management: 81,
    financials: 74,
    strategic_fit: 65,
    ip_technology: null,
  },
  recommendation: {
    verdict: "PROCEED",
    summary:
      "Proceed to second diligence phase. Strong operational fundamentals and management quality offset concentration and capex concerns.",
    conditions: [
      "Verify top-3 customer contract terms and renewal timelines",
      "Commission independent assessment of capex requirements for Southeast Asia expansion",
      "Obtain audited financials for FY2023 and FY2024",
    ],
    has_disqualifier: false,
  },
  strengths: [
    {
      title: "Proprietary Process Technology",
      description:
        "Apex has developed unique coating and precision machining processes protected by 7 patents, creating meaningful barriers to entry and supporting premium pricing.",
      significance: "high",
    },
    {
      title: "Long-term OEM Contracts",
      description:
        "Multi-year supply agreements with tier-1 aerospace OEMs provide revenue visibility and reduce near-term churn risk.",
      significance: "high",
    },
    {
      title: "Experienced Management Team",
      description:
        "CEO and COO have 15+ years of industry experience and have collectively overseen 3 successful operational turnarounds.",
      significance: "medium",
    },
    {
      title: "Strong EBITDA Margins",
      description:
        "28% EBITDA margins are 600bps above industry median, reflecting operational efficiency and technology-driven differentiation.",
      significance: "high",
    },
  ],
  risks: [
    {
      title: "Customer Concentration",
      description:
        "Top 3 customers account for 58% of total revenue. Loss of a single major customer could materially impact earnings.",
      severity: "high",
      likelihood: "medium",
      mitigation:
        "Pursue diversification through new verticals (defense, automotive). Current pipeline includes 12 qualified prospects.",
    },
    {
      title: "Capex-Intensive Expansion",
      description:
        "Southeast Asia greenfield facility requires an estimated $45M capex investment before generating returns.",
      severity: "medium",
      likelihood: "high",
      mitigation:
        "Evaluate phased build-out strategy or partnership with local manufacturer to reduce upfront capital commitment.",
    },
    {
      title: "Supply Chain Disruption",
      description:
        "Key raw materials (titanium alloys, specialty coatings) are sourced from limited suppliers, creating single-source exposure.",
      severity: "medium",
      likelihood: "medium",
      mitigation: "Implement dual-source strategy and strategic inventory buffer for critical materials.",
    },
    {
      title: "Key Man Dependency",
      description:
        "CTO holds critical process knowledge with limited documentation or succession planning.",
      severity: "low",
      likelihood: "low",
      mitigation: "Knowledge transfer program and employment retention incentive package recommended.",
    },
  ],
  value_creation: [
    {
      title: "Operational Efficiency Program",
      description:
        "Lean manufacturing implementation and ERP upgrade expected to reduce COGS by 150-200bps over 18 months.",
      timeframe: "short",
      potential: "medium",
    },
    {
      title: "Southeast Asia Expansion",
      description:
        "Greenfield facility to capture growing aerospace MRO demand in Singapore and Malaysia. Projected $35M incremental revenue by Year 3.",
      timeframe: "medium",
      potential: "high",
    },
    {
      title: "Defense Vertical Entry",
      description:
        "Leverage existing aerospace certifications to enter US DoD supply chain. Initial contract awards expected within 24 months.",
      timeframe: "medium",
      potential: "high",
    },
    {
      title: "IP Monetization",
      description:
        "License coating technology to non-competing industries (medical devices, automotive). Estimated $2-4M annual royalty stream.",
      timeframe: "long",
      potential: "medium",
    },
  ],
  key_questions: [
    {
      question: "What are the contract renewal timelines and terms for the top 3 customers?",
      rationale: "Customer concentration is the primary risk; understanding renewal dynamics is critical for underwriting.",
      priority: "high",
      owner: "Deal Team",
    },
    {
      question: "Has the CTO agreed to a retention/employment agreement as part of the transaction?",
      rationale: "Key man risk is material given undocumented process knowledge.",
      priority: "high",
      owner: "HR / Legal",
    },
    {
      question: "What is the realistic timeline and phased capex plan for the SE Asia facility?",
      rationale: "Capital allocation efficiency is crucial given debt-funded acquisition structure.",
      priority: "medium",
      owner: "Operations DD",
    },
    {
      question: "Are there any environmental liabilities associated with the coating processes?",
      rationale: "Specialty chemical processes may carry legacy environmental exposure not reflected in financials.",
      priority: "medium",
      owner: "Environmental Counsel",
    },
  ],
  data_quality: {
    confidence: "high",
    completeness_pct: 82,
    missing_data: ["FY2024 audited financials", "Environmental assessment report", "Customer contract redlines"],
    caveats: [
      "Financial projections provided by management; independent QoE not yet completed",
      "Capex estimates based on preliminary site assessment; final engineering study pending",
    ],
  },
  snapshot_metrics: {
    revenue_usd: 187_000_000,
    ebitda_usd: 52_360_000,
    ebitda_margin_pct: 28,
    revenue_growth_pct: 14.2,
    enterprise_value_usd: 420_000_000,
    ev_revenue_multiple: 2.2,
    ev_ebitda_multiple: 8.0,
    debt_to_ebitda: 3.2,
    irr_target_pct: 22,
    moic_target: 2.8,
  },
  raw_document: `INVESTMENT MEMO — APEX MANUFACTURING CO.
Prepared by: IST Scanner AI
Date: March 1, 2026

COMPANY OVERVIEW
Apex Manufacturing Co. is a precision components manufacturer specializing in aerospace
and industrial applications. Founded in 1987, the company operates two facilities in the
United States (Tulsa, OK and Hartford, CT) and employs approximately 1,200 people.

TRANSACTION SUMMARY
Sponsor: [Private Equity Firm]
Transaction Type: Buyout
Enterprise Value: ~$420M
Revenue: $187M (LTM)
EBITDA: $52.4M (LTM)
Entry Multiple: 8.0x EV/EBITDA

MARKET OPPORTUNITY
The global aerospace components market is projected to grow at 6.8% CAGR through 2030,
driven by commercial aviation fleet expansion and defense modernization programs...
`,
};
