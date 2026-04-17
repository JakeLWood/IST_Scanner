/**
 * excelExport — Client-side Excel generation using ExcelJS.
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

function formatDate(iso?: string): string {
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
}

/** Score-based fill colour for summary cells (ARGB hex). */
function scoreFill(score: number | null): string {
  if (score === null) return "FFFFFFFF";
  if (score >= 7) return "FFD1FAE5"; // emerald-100
  if (score >= 5) return "FFFEF3C7"; // amber-100
  return "FFFEE2E2"; // red-100
}

/** Recommendation fill colour (ARGB hex). */
function recFill(rec: string): string {
  if (rec === "PROCEED") return "FFD1FAE5";
  if (rec === "FURTHER_REVIEW") return "FFFEF3C7";
  return "FFFEE2E2";
}

/**
 * Build and trigger a download of the bulk export Excel workbook.
 * Dynamically imports ExcelJS so it is only bundled client-side.
 */
export async function downloadBulkExcel(rows: ExportRow[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "IST Screener — Catalyze Partners";
  wb.created = new Date();

  // ─────────────────────────────────────────────
  // Sheet 1: Summary
  // ─────────────────────────────────────────────

  const summary = wb.addWorksheet("Summary");

  const summaryColumns = [
    { header: "Company Name", key: "companyName", width: 30 },
    { header: "Date Screened", key: "dateScreened", width: 16 },
    { header: "Deal Type", key: "dealType", width: 18 },
    { header: "Sector", key: "sector", width: 22 },
    { header: "Deal Source", key: "dealSource", width: 24 },
    { header: "Screened By", key: "screenedBy", width: 22 },
    { header: "Composite Score", key: "compositeScore", width: 16 },
    { header: "Recommendation", key: "recommendation", width: 18 },
    ...PE_DIMENSIONS.map((d) => ({
      header: `Score: ${d.label}`,
      key: d.key,
      width: 18,
    })),
    { header: "Score: Technology Readiness", key: "technologyReadiness", width: 22 },
    { header: "Score: IP Strength & Defensibility", key: "ipStrength", width: 28 },
    { header: "Score: Commercialization Pathway", key: "commercialization", width: 28 },
    { header: "Score: Orthogonal Applications", key: "orthogonal", width: 26 },
    { header: "Executive Summary", key: "executiveSummary", width: 70 },
  ];

  summary.columns = summaryColumns;

  // Style the header row
  const headerRow = summary.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 24;

  // Data rows
  rows.forEach(({ analysis, scoringResult, dealSource, dateScreened, sector, screenedBy }) => {
    const row = summary.addRow({
      companyName: analysis.companyName,
      dateScreened: formatDate(dateScreened ?? analysis.analysisDate),
      dealType: analysis.dealType === "traditional_pe" ? "Traditional PE" : "IP / Technology",
      sector: sector ?? "",
      dealSource: dealSource ?? "",
      screenedBy: screenedBy ?? "",
      compositeScore: scoringResult.compositeScore,
      recommendation: scoringResult.recommendation,
      ...Object.fromEntries(
        PE_DIMENSIONS.map((d) => [d.key, scoringResult.dimensionScores[d.key] ?? ""])
      ),
      technologyReadiness: analysis.technologyReadiness?.score ?? "",
      ipStrength: analysis.ipStrengthDefensibility?.score ?? "",
      commercialization: analysis.commercializationPathway?.score ?? "",
      orthogonal: analysis.orthogonalApplicationPotential?.score ?? "",
      executiveSummary: analysis.executiveSummary,
    });

    // Colour-code composite score and recommendation
    const scoreCell = row.getCell("compositeScore");
    scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: scoreFill(scoringResult.compositeScore) } };
    scoreCell.font = { bold: true };

    const recCell = row.getCell("recommendation");
    recCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: recFill(scoringResult.recommendation) } };
    recCell.font = { bold: true };

    // Colour-code individual dimension scores
    PE_DIMENSIONS.forEach((d) => {
      const score = scoringResult.dimensionScores[d.key];
      if (score !== undefined) {
        const cell = row.getCell(d.key);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: scoreFill(score) } };
      }
    });

    row.alignment = { vertical: "top", wrapText: false };
  });

  // Freeze the header row and company-name column
  summary.views = [{ state: "frozen", xSplit: 1, ySplit: 1, activeCell: "B2" }];

  // ─────────────────────────────────────────────
  // Sheets 2…N: One sheet per screening
  // ─────────────────────────────────────────────

  rows.forEach(({ analysis, scoringResult }, idx) => {
    const ws = wb.addWorksheet(toSheetName(analysis.companyName, idx));

    ws.columns = [
      { key: "label", width: 32 },
      { key: "value", width: 12 },
      { key: "commentary", width: 55 },
      { key: "findings", width: 60 },
    ];

    const addHeader = (text: string) => {
      const r = ws.addRow([text]);
      r.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      r.height = 18;
      ws.mergeCells(`A${r.number}:D${r.number}`);
    };

    const addSubHeader = (text: string) => {
      const r = ws.addRow([text]);
      r.font = { bold: true, color: { argb: "FF4F46E5" } };
      r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
      ws.mergeCells(`A${r.number}:D${r.number}`);
    };

    const addKV = (label: string, value: string | number | null) => {
      const r = ws.addRow([label, String(value ?? "")]);
      r.getCell(1).font = { bold: true };
    };

    const addBlank = () => ws.addRow([]);

    // ---- Header block ----
    addHeader(`${analysis.companyName} — IST Screening Report`);
    addKV("Deal Type", analysis.dealType === "traditional_pe" ? "Traditional PE" : "IP / Technology");
    addKV("Analysis Date", analysis.analysisDate);
    addKV("Composite Score", `${scoringResult.compositeScore.toFixed(1)} / 10`);
    addKV("Recommendation", scoringResult.recommendation);
    addKV("Disqualified", scoringResult.isDisqualified ? "Yes" : "No");
    addBlank();

    // ---- Executive Summary ----
    addSubHeader("Executive Summary");
    const summaryTextRow = ws.addRow([analysis.executiveSummary]);
    summaryTextRow.alignment = { wrapText: true };
    summaryTextRow.height = 60;
    ws.mergeCells(`A${summaryTextRow.number}:D${summaryTextRow.number}`);
    addBlank();

    // ---- Section headers ----
    addSubHeader("Dimension Analysis");
    const colHeaders = ws.addRow(["Section", "Score", "Commentary", "Key Findings"]);
    colHeaders.font = { bold: true };
    colHeaders.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

    const addSection = (
      section: { sectionName: string; score: number; commentary: string; keyFindings: string[] } | undefined
    ) => {
      if (!section) return;
      const r = ws.addRow([
        section.sectionName,
        section.score,
        section.commentary,
        section.keyFindings.map((f, i) => `${i + 1}. ${f}`).join("\n"),
      ]);
      r.alignment = { vertical: "top", wrapText: true };
      // Colour-code score cell
      const scoreCell = r.getCell(2);
      scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: scoreFill(section.score) } };
      scoreCell.font = { bold: true };
      r.height = Math.max(18, section.keyFindings.length * 15);
    };

    addSection(analysis.companyOverview);
    addSection(analysis.marketOpportunity);
    addSection(analysis.financialProfile);
    addSection(analysis.managementTeam);
    addSection(analysis.investmentThesis);
    addSection(analysis.riskAssessment);
    addSection(analysis.dealDynamics);

    // IP-track sections
    if (analysis.technologyReadiness) {
      addSection(analysis.technologyReadiness);
      if (analysis.technologyReadiness.trlLevel !== null && analysis.technologyReadiness.trlLevel !== undefined) {
        ws.addRow(["", "", `TRL Level: ${analysis.technologyReadiness.trlLevel}`, ""]);
      }
    }
    addSection(analysis.ipStrengthDefensibility);
    if (analysis.commercializationPathway) {
      addSection(analysis.commercializationPathway);
      if (analysis.commercializationPathway.phaseTimeline?.length) {
        const r = ws.addRow([
          "",
          "",
          "Phase Timeline:",
          analysis.commercializationPathway.phaseTimeline.join("\n"),
        ]);
        r.alignment = { vertical: "top", wrapText: true };
        r.height = analysis.commercializationPathway.phaseTimeline.length * 18;
      }
    }
    if (analysis.orthogonalApplicationPotential) {
      addSection(analysis.orthogonalApplicationPotential);
      if (analysis.orthogonalApplicationPotential.adjacentMarkets?.length) {
        const r = ws.addRow([
          "",
          "",
          "Adjacent Markets:",
          analysis.orthogonalApplicationPotential.adjacentMarkets
            .map((m) => `${m.market} — ${m.tamEstimate}: ${m.rationale}`)
            .join("\n"),
        ]);
        r.alignment = { vertical: "top", wrapText: true };
        r.height = analysis.orthogonalApplicationPotential.adjacentMarkets.length * 24;
      }
    }

    // ---- Dimension weights ----
    addBlank();
    addSubHeader("Dimension Weights Used");
    PE_DIMENSIONS.forEach((d) => {
      const weight = scoringResult.dimensionWeights[d.key];
      if (weight !== undefined) {
        ws.addRow([d.label, `${weight}%`]);
      }
    });

    // Freeze the top row
    ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  });

  // ─────────────────────────────────────────────
  // Write & trigger download
  // ─────────────────────────────────────────────

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const timestamp = new Date().toISOString().slice(0, 10);
  a.download = `IST_Bulk_Export_${timestamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

