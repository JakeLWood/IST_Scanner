/**
 * excelExport — Client-side Excel generation using SheetJS (xlsx).
 *
 * Produces a workbook with:
 *   • Sheet 1 "Summary"   — one row per selected screening with all snapshot
 *                           metrics, section scores, and recommendation.
 *   • Sheet N+1 onwards   — one sheet per selected screening with the full
 *                           analysis (section name, score, commentary, key
 *                           findings).
 *
 * PRD §6.2.3 — Bulk export feature.
 */

import type { ISTAnalysis } from "@/types/ist-analysis";
import type { ScoringResult, ISTDimension } from "@/lib/scoringEngine";

// All seven standard PE dimensions in display order.
const PE_DIMENSIONS: { key: ISTDimension; label: string }[] = [
  { key: "companyOverview", label: "Company Overview" },
  { key: "marketOpportunity", label: "Market Opportunity" },
  { key: "financialProfile", label: "Financial Profile" },
  { key: "managementTeam", label: "Management Team" },
  { key: "investmentThesis", label: "Investment Thesis" },
  { key: "riskAssessment", label: "Risk Assessment" },
  { key: "dealDynamics", label: "Deal Dynamics" },
];

export interface ExportRow {
  id: string;
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  dealSource: string | null;
  /** Summary metadata (may be absent for demo rows) */
  dateScreened?: string;
  sector?: string | null;
  screenedBy?: string | null;
}

/** Sanitise a company name so it can be used as a sheet name (max 31 chars). */
function toSheetName(name: string, index: number): string {
  const safe = name.replace(/[\\/*?[\]:]/g, "").trim();
  const prefix = `${index + 1}. `;
  const maxLen = 31 - prefix.length;
  return `${prefix}${safe.length > maxLen ? safe.slice(0, maxLen) : safe}`;
}

/**
 * Build and trigger a download of the bulk export Excel workbook.
 * This function dynamically imports xlsx so it is only bundled client-side.
 */
export async function downloadBulkExcel(rows: ExportRow[]): Promise<void> {
  // Dynamic import — avoids bundling xlsx on the server.
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  // ─────────────────────────────────────────────
  // Sheet 1: Summary
  // ─────────────────────────────────────────────

  const summaryHeader = [
    "Company Name",
    "Date Screened",
    "Deal Type",
    "Sector",
    "Deal Source",
    "Screened By",
    "Composite Score",
    "Recommendation",
    ...PE_DIMENSIONS.map((d) => `Score: ${d.label}`),
    // IP-track extra sections
    "Score: Technology Readiness",
    "Score: IP Strength & Defensibility",
    "Score: Commercialization Pathway",
    "Score: Orthogonal Application Potential",
    "Executive Summary",
  ];

  const summaryData: (string | number | null)[][] = rows.map(
    ({ analysis, scoringResult, dealSource, dateScreened, sector, screenedBy }) => {
      const a = analysis;
      const formatDate = (iso?: string) => {
        if (!iso) return "";
        try {
          return new Date(iso).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } catch {
          return iso;
        }
      };
      return [
        a.companyName,
        formatDate(dateScreened ?? a.analysisDate),
        a.dealType === "traditional_pe" ? "Traditional PE" : "IP / Technology",
        sector ?? null,
        dealSource ?? null,
        screenedBy ?? null,
        scoringResult.compositeScore,
        scoringResult.recommendation,
        // PE dimension scores
        scoringResult.dimensionScores.companyOverview ?? null,
        scoringResult.dimensionScores.marketOpportunity ?? null,
        scoringResult.dimensionScores.financialProfile ?? null,
        scoringResult.dimensionScores.managementTeam ?? null,
        scoringResult.dimensionScores.investmentThesis ?? null,
        scoringResult.dimensionScores.riskAssessment ?? null,
        scoringResult.dimensionScores.dealDynamics ?? null,
        // IP-track sections (null when not applicable)
        a.technologyReadiness?.score ?? null,
        a.ipStrengthDefensibility?.score ?? null,
        a.commercializationPathway?.score ?? null,
        a.orthogonalApplicationPotential?.score ?? null,
        a.executiveSummary,
      ];
    }
  );

  const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryData]);

  // Set column widths for readability.
  summarySheet["!cols"] = [
    { wch: 28 }, // Company Name
    { wch: 14 }, // Date Screened
    { wch: 16 }, // Deal Type
    { wch: 20 }, // Sector
    { wch: 22 }, // Deal Source
    { wch: 20 }, // Screened By
    { wch: 16 }, // Composite Score
    { wch: 16 }, // Recommendation
    ...PE_DIMENSIONS.map(() => ({ wch: 14 })), // dimension scores
    { wch: 14 }, // TRL
    { wch: 14 }, // IP Strength
    { wch: 14 }, // Commercialization
    { wch: 14 }, // Orthogonal
    { wch: 60 }, // Executive Summary
  ];

  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // ─────────────────────────────────────────────
  // Sheets 2…N: One sheet per screening
  // ─────────────────────────────────────────────

  rows.forEach(({ analysis, scoringResult }, idx) => {
    const a = analysis;
    const sheetRows: (string | number | null)[][] = [];

    // ---- Header block ----
    sheetRows.push(["Company", a.companyName]);
    sheetRows.push(["Deal Type", a.dealType === "traditional_pe" ? "Traditional PE" : "IP / Technology"]);
    sheetRows.push(["Analysis Date", a.analysisDate]);
    sheetRows.push(["Composite Score", scoringResult.compositeScore]);
    sheetRows.push(["Recommendation", scoringResult.recommendation]);
    sheetRows.push(["Disqualified", scoringResult.isDisqualified ? "Yes" : "No"]);
    sheetRows.push([]);
    sheetRows.push(["Executive Summary"]);
    sheetRows.push([a.executiveSummary]);
    sheetRows.push([]);

    // ---- Dimension sections ----
    sheetRows.push(["Section", "Score", "Commentary", "Key Findings"]);

    const pushSection = (
      section: { sectionName: string; score: number; commentary: string; keyFindings: string[] } | undefined
    ) => {
      if (!section) return;
      sheetRows.push([
        section.sectionName,
        section.score,
        section.commentary,
        section.keyFindings.join("\n• "),
      ]);
    };

    pushSection(a.companyOverview);
    pushSection(a.marketOpportunity);
    pushSection(a.financialProfile);
    pushSection(a.managementTeam);
    pushSection(a.investmentThesis);
    pushSection(a.riskAssessment);
    pushSection(a.dealDynamics);

    // IP-track sections
    if (a.technologyReadiness) {
      pushSection(a.technologyReadiness);
      if (a.technologyReadiness.trlLevel !== null && a.technologyReadiness.trlLevel !== undefined) {
        sheetRows.push(["", "", `TRL Level: ${a.technologyReadiness.trlLevel}`, ""]);
      }
    }
    pushSection(a.ipStrengthDefensibility);
    if (a.commercializationPathway) {
      pushSection(a.commercializationPathway);
      if (a.commercializationPathway.phaseTimeline?.length) {
        sheetRows.push(["", "", "Phase Timeline:", a.commercializationPathway.phaseTimeline.join("\n")]);
      }
    }
    if (a.orthogonalApplicationPotential) {
      pushSection(a.orthogonalApplicationPotential);
      if (a.orthogonalApplicationPotential.adjacentMarkets?.length) {
        sheetRows.push([
          "",
          "",
          "Adjacent Markets:",
          a.orthogonalApplicationPotential.adjacentMarkets
            .map((m) => `${m.market} — ${m.tamEstimate}: ${m.rationale}`)
            .join("\n"),
        ]);
      }
    }

    // Dimension weights
    sheetRows.push([]);
    sheetRows.push(["Dimension Weights Used"]);
    for (const dim of PE_DIMENSIONS) {
      const weight = scoringResult.dimensionWeights[dim.key];
      if (weight !== undefined) {
        sheetRows.push([dim.label, `${weight}%`]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws["!cols"] = [
      { wch: 30 }, // Section name / label
      { wch: 10 }, // Score / value
      { wch: 55 }, // Commentary
      { wch: 60 }, // Key findings
    ];

    const sheetName = toSheetName(a.companyName, idx);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // ─────────────────────────────────────────────
  // Write & trigger download
  // ─────────────────────────────────────────────

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `IST_Bulk_Export_${timestamp}.xlsx`;

  XLSX.writeFile(wb, filename);
}
