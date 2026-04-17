/**
 * BulkScreeningPDF — @react-pdf/renderer document for bulk export.
 *
 * Structure:
 *   Page 1   — Cover page: generation date + summary table of all selected
 *              screenings (company, score, recommendation).
 *   Pages 2+ — One set of pages per selected screening (header, executive
 *              summary, snapshot grid, dimension details, risk/thesis section,
 *              key management questions).
 *
 * PRD §6.2.3 — Bulk export feature.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ISTAnalysis, ISTSection } from "@/types/ist-analysis";
import type { ScoringResult, ISTDimension } from "@/lib/scoringEngine";

// ---------------------------------------------------------------------------
// Colour palette (same as ScreeningPDF)
// ---------------------------------------------------------------------------
const C = {
  headerBg: "#0f172a",
  sectionBg: "#1e293b",
  white: "#ffffff",
  headerText: "#f1f5f9",
  bodyText: "#1e293b",
  mutedText: "#64748b",
  secondaryText: "#475569",
  indigo: "#4f46e5",
  green: "#16a34a",
  greenBg: "#dcfce7",
  amber: "#b45309",
  amberBg: "#fef3c7",
  red: "#dc2626",
  redBg: "#fee2e2",
  border: "#e2e8f0",
  coverBg: "#1e293b",
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: C.white,
    paddingTop: 30,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 9,
    color: C.bodyText,
  },

  // ── Cover page ──
  coverPage: {
    fontFamily: "Helvetica",
    backgroundColor: C.headerBg,
    padding: 48,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
  },
  coverTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 26,
    color: C.headerText,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 4,
  },
  coverDate: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 36,
  },
  coverTableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 2,
  },
  coverTableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    borderBottomStyle: "solid",
  },
  coverTableRowAlt: {
    backgroundColor: "#1e293b",
  },
  coverColName: { flex: 2.5 },
  coverColType: { flex: 1.2 },
  coverColScore: { flex: 0.8 },
  coverColRec: { flex: 1.2 },
  coverHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  coverCell: { fontSize: 8.5, color: "#e2e8f0" },
  coverScoreCell: { fontFamily: "Courier-Bold", fontSize: 8.5 },
  coverBadge: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 8,
    alignSelf: "flex-start",
  },

  // ── Screening divider ──
  screeningDivider: {
    backgroundColor: "#0f172a",
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderRadius: 3,
  },
  screeningDividerText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // ── Screening header ──
  header: {
    backgroundColor: C.headerBg,
    borderRadius: 6,
    padding: 14,
    marginBottom: 12,
  },
  companyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: C.headerText,
    marginBottom: 6,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
  },
  dealTypeBadge: { backgroundColor: "#3730a3", color: "#e0e7ff" },
  proceedBadge: { backgroundColor: "#14532d", color: "#bbf7d0" },
  furtherReviewBadge: { backgroundColor: "#78350f", color: "#fde68a" },
  passBadge: { backgroundColor: "#7f1d1d", color: "#fecaca" },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  compositeScore: { fontFamily: "Courier-Bold", fontSize: 24, lineHeight: 1 },
  compositeScoreLabel: { fontFamily: "Courier", fontSize: 10, color: "#94a3b8" },
  analysisDate: { fontSize: 7.5, color: "#94a3b8", marginTop: 3 },

  // ── Sections ──
  section: { marginBottom: 12 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.indigo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
  },

  // ── Executive summary ──
  summaryText: { fontSize: 8.5, color: C.bodyText, lineHeight: 1.55 },

  // ── Snapshot grid ──
  snapshotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  snapshotCell: {
    width: "13.5%",
    borderRadius: 4,
    padding: 5,
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "solid",
  },
  snapshotScore: { fontFamily: "Courier-Bold", fontSize: 13, lineHeight: 1, marginBottom: 2 },
  snapshotLabel: { fontSize: 6.5, color: C.mutedText, textAlign: "center", lineHeight: 1.3 },

  // ── Dimension detail cards ──
  twoCol: { flexDirection: "row", gap: 6 },
  col: { flex: 1 },
  dimCard: { borderWidth: 1, borderStyle: "solid", borderRadius: 4, padding: 7, marginBottom: 5 },
  dimHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  dimName: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: C.bodyText },
  dimScoreBadge: { fontFamily: "Courier-Bold", fontSize: 8.5 },
  dimCommentary: { fontSize: 8, color: C.secondaryText, lineHeight: 1.5, marginBottom: 3 },
  bulletList: { paddingLeft: 2, gap: 1.5 },
  bulletRow: { flexDirection: "row", gap: 3 },
  bulletDot: { color: C.indigo, fontSize: 8, marginTop: 0.5 },
  bulletText: { fontSize: 7.5, color: C.secondaryText, lineHeight: 1.4, flex: 1 },

  // ── Risk table ──
  riskTable: { borderWidth: 1, borderStyle: "solid", borderColor: C.border, borderRadius: 4 },
  riskHead: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: C.border,
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  riskHeadCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.mutedText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  riskRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: C.border,
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  riskRowLast: { borderBottomWidth: 0 },
  riskColDim: { width: "24%", paddingRight: 5 },
  riskColScore: { width: "12%", paddingRight: 5 },
  riskColDetail: { flex: 1 },
  riskDimName: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.bodyText, marginBottom: 2 },
  riskScoreText: { fontFamily: "Courier-Bold", fontSize: 8.5 },
  riskBand: { fontSize: 7, color: C.mutedText },
  riskCommentary: { fontSize: 7.5, color: C.secondaryText, lineHeight: 1.4, marginBottom: 2 },

  // ── Footer ──
  footer: {
    position: "absolute",
    bottom: 14,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: C.border,
    paddingTop: 4,
  },
  footerText: { fontSize: 7, color: C.mutedText },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 7) return C.green;
  if (score >= 5) return C.amber;
  return C.red;
}

function scoreBg(score: number): { backgroundColor: string; borderColor: string } {
  if (score >= 7) return { backgroundColor: C.greenBg, borderColor: "#86efac" };
  if (score >= 5) return { backgroundColor: C.amberBg, borderColor: "#fcd34d" };
  return { backgroundColor: C.redBg, borderColor: "#fca5a5" };
}

function scoreBand(score: number): string {
  if (score >= 7) return "Strong";
  if (score >= 5) return "Adequate";
  if (score >= 3) return "Concerning";
  return "Deal-breaking";
}

function verdictLabel(v: string): string {
  if (v === "PROCEED") return "PROCEED";
  if (v === "FURTHER_REVIEW") return "FURTHER REVIEW";
  return "PASS";
}

function verdictBadgeStyle(v: string) {
  if (v === "PROCEED") return s.proceedBadge;
  if (v === "FURTHER_REVIEW") return s.furtherReviewBadge;
  return s.passBadge;
}

function verdictCoverColor(v: string): string {
  if (v === "PROCEED") return "#4ade80";
  if (v === "FURTHER_REVIEW") return "#fbbf24";
  return "#f87171";
}

function compositeColor(score: number): string {
  if (score >= 7) return C.green;
  if (score >= 5) return C.amber;
  return C.red;
}

function dealTypeLabel(dt: string): string {
  return dt === "traditional_pe" ? "Traditional PE" : "IP / Technology";
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={s.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function DimCard({ label, section }: { label: string; section: ISTSection }) {
  const bg = scoreBg(section.score);
  return (
    <View style={[s.dimCard, { borderColor: bg.borderColor, backgroundColor: bg.backgroundColor }]}>
      <View style={s.dimHeader}>
        <Text style={s.dimName}>{label}</Text>
        <Text style={[s.dimScoreBadge, { color: scoreColor(section.score) }]}>
          {section.score}/10 — {scoreBand(section.score)}
        </Text>
      </View>
      <Text style={s.dimCommentary}>{section.commentary}</Text>
      <BulletList items={section.keyFindings} />
    </View>
  );
}

function RiskRow({ section, isLast }: { section: ISTSection; isLast: boolean }) {
  return (
    <View style={[s.riskRow, isLast ? s.riskRowLast : {}]}>
      <View style={s.riskColDim}>
        <Text style={s.riskDimName}>{section.sectionName}</Text>
      </View>
      <View style={s.riskColScore}>
        <Text style={[s.riskScoreText, { color: scoreColor(section.score) }]}>{section.score}/10</Text>
        <Text style={s.riskBand}>{scoreBand(section.score)}</Text>
      </View>
      <View style={s.riskColDetail}>
        <Text style={s.riskCommentary}>{section.commentary}</Text>
        <BulletList items={section.keyFindings} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dimension label maps
// ---------------------------------------------------------------------------
const DIMENSION_LABELS: Record<ISTDimension, string> = {
  companyOverview: "Company Overview",
  marketOpportunity: "Market Opportunity",
  financialProfile: "Financial Profile",
  managementTeam: "Management Team",
  investmentThesis: "Investment Thesis",
  riskAssessment: "Risk Assessment",
  dealDynamics: "Deal Dynamics",
};

const PE_DIMS: ISTDimension[] = [
  "companyOverview",
  "marketOpportunity",
  "financialProfile",
  "managementTeam",
  "investmentThesis",
  "riskAssessment",
  "dealDynamics",
];

// ---------------------------------------------------------------------------
// Single-screening pages (reusable within the bulk Document)
// ---------------------------------------------------------------------------

interface ScreeningPagesProps {
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  index: number;
  totalCount: number;
  generatedDate: string;
}

function ScreeningPages({ analysis, scoringResult, index, totalCount, generatedDate }: ScreeningPagesProps) {
  const { compositeScore, recommendation, isDisqualified, dimensionScores } = scoringResult;
  const isIP = analysis.dealType === "ip_technology";

  const sortedDims = [...PE_DIMS].sort((a, b) => dimensionScores[a] - dimensionScores[b]);
  const leftDims = sortedDims.filter((_, i) => i % 2 === 0);
  const rightDims = sortedDims.filter((_, i) => i % 2 !== 0);

  const riskSections: ISTSection[] = [
    analysis.riskAssessment,
    ...PE_DIMS.filter((d) => d !== "riskAssessment" && dimensionScores[d] <= 6)
      .sort((a, b) => dimensionScores[a] - dimensionScores[b])
      .map((d) => analysis[d]),
  ];

  return (
    <>
      {/* ── Page 1: Header + Executive Summary + Snapshot + Dimension Details ── */}
      <Page size="A4" style={s.page}>
        {/* Divider banner showing which screening this is */}
        <View style={s.screeningDivider}>
          <Text style={s.screeningDividerText}>
            Screening {index + 1} of {totalCount} — {analysis.companyName}
          </Text>
        </View>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.companyName}>{analysis.companyName}</Text>
          <View style={s.headerMeta}>
            <Text style={[s.badge, s.dealTypeBadge]}>{dealTypeLabel(analysis.dealType)}</Text>
            <Text style={[s.badge, verdictBadgeStyle(recommendation)]}>{verdictLabel(recommendation)}</Text>
            {isDisqualified && (
              <Text style={[s.badge, s.passBadge]}>DISQUALIFIED</Text>
            )}
          </View>
          <View style={s.scoreRow}>
            <Text style={[s.compositeScore, { color: compositeColor(compositeScore) }]}>
              {compositeScore.toFixed(1)}
            </Text>
            <Text style={s.compositeScoreLabel}> / 10</Text>
          </View>
          <Text style={s.analysisDate}>Analysis Date: {analysis.analysisDate}</Text>
        </View>

        {/* Executive Summary */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Executive Summary</Text>
          <Text style={s.summaryText}>{analysis.executiveSummary}</Text>
        </View>

        {/* Snapshot */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Investment Snapshot</Text>
          <View style={s.snapshotGrid}>
            {PE_DIMS.map((dim) => {
              const score = dimensionScores[dim];
              const bg = scoreBg(score);
              return (
                <View key={dim} style={[s.snapshotCell, { backgroundColor: bg.backgroundColor, borderColor: bg.borderColor }]}>
                  <Text style={[s.snapshotScore, { color: scoreColor(score) }]}>{score}</Text>
                  <Text style={s.snapshotLabel}>{DIMENSION_LABELS[dim]}</Text>
                </View>
              );
            })}
            {isIP && analysis.technologyReadiness && (() => {
              const score = analysis.technologyReadiness!.score;
              const bg = scoreBg(score);
              return (
                <View style={[s.snapshotCell, { backgroundColor: bg.backgroundColor, borderColor: bg.borderColor }]}>
                  <Text style={[s.snapshotScore, { color: scoreColor(score) }]}>{score}</Text>
                  <Text style={s.snapshotLabel}>Tech Readiness</Text>
                </View>
              );
            })()}
            {isIP && analysis.ipStrengthDefensibility && (() => {
              const score = analysis.ipStrengthDefensibility!.score;
              const bg = scoreBg(score);
              return (
                <View style={[s.snapshotCell, { backgroundColor: bg.backgroundColor, borderColor: bg.borderColor }]}>
                  <Text style={[s.snapshotScore, { color: scoreColor(score) }]}>{score}</Text>
                  <Text style={s.snapshotLabel}>IP Strength</Text>
                </View>
              );
            })()}
          </View>
        </View>

        {/* Dimension detail cards */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Dimension Scores (lowest first)</Text>
          <View style={s.twoCol}>
            <View style={s.col}>
              {leftDims.map((dim) => (
                <DimCard key={dim} label={DIMENSION_LABELS[dim]} section={analysis[dim]} />
              ))}
            </View>
            <View style={s.col}>
              {rightDims.map((dim) => (
                <DimCard key={dim} label={DIMENSION_LABELS[dim]} section={analysis[dim]} />
              ))}
            </View>
          </View>
          {isIP && analysis.technologyReadiness && (
            <DimCard label="Technology Readiness" section={analysis.technologyReadiness} />
          )}
          {isIP && analysis.ipStrengthDefensibility && (
            <DimCard label="IP Strength & Defensibility" section={analysis.ipStrengthDefensibility} />
          )}
        </View>

        {/* Page footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{analysis.companyName} — IST Bulk Export</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
          <Text style={s.footerText}>{generatedDate}</Text>
        </View>
      </Page>

      {/* ── Page 2: Risk Table + Investment Thesis / IP Sections + Questions ── */}
      <Page size="A4" style={s.page}>
        {/* Risk table */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Risk Assessment</Text>
          <View style={s.riskTable}>
            <View style={s.riskHead}>
              <Text style={[s.riskHeadCell, s.riskColDim]}>Dimension</Text>
              <Text style={[s.riskHeadCell, s.riskColScore]}>Score</Text>
              <Text style={[s.riskHeadCell, s.riskColDetail]}>Commentary &amp; Findings</Text>
            </View>
            {riskSections.map((sec, i) => (
              <RiskRow key={i} section={sec} isLast={i === riskSections.length - 1} />
            ))}
          </View>
        </View>

        {/* Investment Thesis / Commercialization Pathway */}
        {isIP ? (
          <>
            {analysis.commercializationPathway && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Commercialization Pathway</Text>
                <Text style={[s.dimCommentary, { marginBottom: 4 }]}>
                  {analysis.commercializationPathway.commentary}
                </Text>
                {(analysis.commercializationPathway.phaseTimeline ?? []).length > 0 && (
                  <BulletList items={analysis.commercializationPathway.phaseTimeline!} />
                )}
                {analysis.commercializationPathway.keyFindings.length > 0 && (
                  <BulletList items={analysis.commercializationPathway.keyFindings} />
                )}
              </View>
            )}
            {analysis.orthogonalApplicationPotential && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Orthogonal Applications</Text>
                <Text style={[s.dimCommentary, { marginBottom: 4 }]}>
                  {analysis.orthogonalApplicationPotential.commentary}
                </Text>
                <BulletList items={analysis.orthogonalApplicationPotential.keyFindings} />
              </View>
            )}
          </>
        ) : (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Value Creation Thesis</Text>
            <Text style={[s.dimCommentary, { marginBottom: 4 }]}>
              {analysis.investmentThesis.commentary}
            </Text>
            <BulletList items={analysis.investmentThesis.keyFindings} />
          </View>
        )}

        {/* Key management questions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Key Management Questions</Text>
          {analysis.dealDynamics.keyFindings.map((q, i) => (
            <View key={i} style={[s.bulletRow, { marginBottom: 4 }]}>
              <Text style={[s.bulletDot, { color: C.indigo, fontFamily: "Helvetica-Bold", width: 14, textAlign: "right" }]}>
                {i + 1}.
              </Text>
              <Text style={[s.bulletText, { fontSize: 8.5, color: C.bodyText }]}>{q}</Text>
            </View>
          ))}
        </View>

        {/* Page footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{analysis.companyName} — IST Bulk Export</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
          <Text style={s.footerText}>{generatedDate}</Text>
        </View>
      </Page>
    </>
  );
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BulkExportItem {
  id: string;
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  dateScreened?: string;
}

// ---------------------------------------------------------------------------
// Main document
// ---------------------------------------------------------------------------

export interface BulkScreeningPDFProps {
  items: BulkExportItem[];
}

export default function BulkScreeningPDF({ items }: BulkScreeningPDFProps) {
  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document
      title="IST Bulk Screening Export"
      author="IST Screener — Catalyze Partners"
      subject="Investment Screening Test — Bulk Export"
    >
      {/* ── Cover Page ── */}
      <Page size="A4" style={s.coverPage}>
        <Text style={s.coverTitle}>IST Screening Summary</Text>
        <Text style={s.coverSubtitle}>
          {items.length} screening{items.length !== 1 ? "s" : ""} selected for export
        </Text>
        <Text style={s.coverDate}>Generated: {generatedDate} · Catalyze Partners IST Screener</Text>

        {/* Summary table header */}
        <View style={s.coverTableHeader}>
          <Text style={[s.coverHeaderCell, s.coverColName]}>Company</Text>
          <Text style={[s.coverHeaderCell, s.coverColType]}>Deal Type</Text>
          <Text style={[s.coverHeaderCell, s.coverColScore]}>Score</Text>
          <Text style={[s.coverHeaderCell, s.coverColRec]}>Recommendation</Text>
        </View>

        {/* Summary table rows */}
        {items.map(({ analysis, scoringResult, dateScreened }, i) => (
          <View key={i} style={[s.coverTableRow, i % 2 === 0 ? {} : s.coverTableRowAlt]}>
            <View style={s.coverColName}>
              <Text style={s.coverCell}>{analysis.companyName}</Text>
              {dateScreened && (
                <Text style={[s.coverCell, { fontSize: 7.5, color: "#64748b" }]}>
                  {formatDate(dateScreened)}
                </Text>
              )}
            </View>
            <Text style={[s.coverCell, s.coverColType]}>{dealTypeLabel(analysis.dealType)}</Text>
            <Text
              style={[s.coverScoreCell, s.coverColScore, { color: compositeColor(scoringResult.compositeScore) }]}
            >
              {scoringResult.compositeScore.toFixed(1)}
            </Text>
            <View style={s.coverColRec}>
              <Text
                style={[
                  s.coverBadge,
                  { color: verdictCoverColor(scoringResult.recommendation) },
                ]}
              >
                {verdictLabel(scoringResult.recommendation)}
              </Text>
            </View>
          </View>
        ))}
      </Page>

      {/* ── One set of pages per screening ── */}
      {items.map(({ analysis, scoringResult }, idx) => (
        <ScreeningPages
          key={idx}
          analysis={analysis}
          scoringResult={scoringResult}
          index={idx}
          totalCount={items.length}
          generatedDate={generatedDate}
        />
      ))}
    </Document>
  );
}
