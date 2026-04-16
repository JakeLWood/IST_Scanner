/**
 * ScreeningPDF — @react-pdf/renderer document that mirrors the on-screen
 * IST report structure from PRD §6.2.2.
 *
 * Sections included:
 *   1. Header: company name, deal-type badge, composite score, recommendation, date
 *   2. Executive Summary
 *   3. Investment Snapshot — per-dimension score grid
 *   4. Dimension Score Details — score, commentary, key findings for each section
 *   5. Risk Assessment — riskAssessment section + low-scoring dimensions
 *   6. Value Creation / Investment Thesis (PE) or Commercialization Pathway (IP)
 *   7. IP-specific: IP Strength & Defensibility, Orthogonal Applications (IP track)
 *   8. Key Management Questions — from dealDynamics (PE) or IP sections
 *
 * Font note (PRD §6.1): The web UI uses JetBrains Mono for monospaced numbers.
 * PDF generation uses the built-in Courier/Courier-Bold fonts instead to avoid a
 * network dependency on a remote font file during client-side PDF rendering.
 * If JetBrains Mono files are ever added to /public, Font.register() can be used
 * here to keep the PDF consistent with the on-screen design.
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
// Colour palette (PDF-safe hex values)
// ---------------------------------------------------------------------------
const COLORS = {
  // Backgrounds
  headerBg: "#0f172a",       // slate-950
  sectionBg: "#1e293b",      // slate-800
  rowAlt: "#f8fafc",         // slate-50
  white: "#ffffff",
  // Text
  headerText: "#f1f5f9",     // slate-100
  bodyText: "#1e293b",       // slate-800
  mutedText: "#64748b",      // slate-500
  secondaryText: "#475569",  // slate-600
  // Accent
  indigo: "#4f46e5",
  // Score colours
  green: "#16a34a",
  greenBg: "#dcfce7",
  amber: "#b45309",
  amberBg: "#fef3c7",
  red: "#dc2626",
  redBg: "#fee2e2",
  // Borders
  border: "#e2e8f0",         // slate-200
  darkBorder: "#334155",     // slate-700
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: COLORS.white,
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 36,
    fontSize: 9,
    color: COLORS.bodyText,
  },

  // ---- Header ----
  header: {
    backgroundColor: COLORS.headerBg,
    borderRadius: 6,
    padding: 16,
    marginBottom: 14,
  },
  companyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: COLORS.headerText,
    marginBottom: 6,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  dealTypeBadge: {
    backgroundColor: "#3730a3",
    color: "#e0e7ff",
  },
  proceedBadge: {
    backgroundColor: "#14532d",
    color: "#bbf7d0",
  },
  furtherReviewBadge: {
    backgroundColor: "#78350f",
    color: "#fde68a",
  },
  passBadge: {
    backgroundColor: "#7f1d1d",
    color: "#fecaca",
  },
  disqualifiedBadge: {
    backgroundColor: "#7f1d1d",
    color: "#fecaca",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  compositeScore: {
    fontFamily: "Courier-Bold",
    fontSize: 28,
    lineHeight: 1,
  },
  compositeScoreLabel: {
    fontFamily: "Courier",
    fontSize: 11,
    color: "#94a3b8",
  },
  headerDate: {
    fontSize: 8,
    color: "#94a3b8",
    marginTop: 4,
  },

  // ---- Section titles ----
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.indigo,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  section: {
    marginBottom: 14,
  },

  // ---- Executive summary ----
  summaryText: {
    fontSize: 9,
    color: COLORS.bodyText,
    lineHeight: 1.55,
  },

  // ---- Snapshot grid ----
  snapshotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  snapshotCell: {
    width: "13.5%",
    borderRadius: 4,
    padding: 6,
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "solid",
  },
  snapshotScore: {
    fontFamily: "Courier-Bold",
    fontSize: 14,
    lineHeight: 1,
    marginBottom: 2,
  },
  snapshotLabel: {
    fontSize: 6.5,
    color: COLORS.mutedText,
    textAlign: "center",
    lineHeight: 1.3,
  },

  // ---- Dimension detail cards ----
  dimensionCard: {
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  dimensionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  dimensionName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.bodyText,
  },
  dimensionScoreBadge: {
    fontFamily: "Courier-Bold",
    fontSize: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  dimensionCommentary: {
    fontSize: 8.5,
    color: COLORS.secondaryText,
    lineHeight: 1.5,
    marginBottom: 4,
  },
  bulletList: {
    paddingLeft: 2,
    gap: 2,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 4,
  },
  bulletDot: {
    color: COLORS.indigo,
    fontSize: 8,
    marginTop: 0.5,
  },
  bulletText: {
    fontSize: 8,
    color: COLORS.secondaryText,
    lineHeight: 1.4,
    flex: 1,
  },

  // ---- Two-column grid for dimension cards ----
  twoColumnGrid: {
    flexDirection: "row",
    gap: 6,
  },
  column: {
    flex: 1,
  },

  // ---- Risk table ----
  riskTable: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  riskTableHead: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  riskTableHeadCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.mutedText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  riskTableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  riskTableRowLast: {
    borderBottomWidth: 0,
  },
  riskColDimension: {
    width: "24%",
    paddingRight: 6,
  },
  riskColScore: {
    width: "12%",
    paddingRight: 6,
  },
  riskColDetail: {
    flex: 1,
  },
  riskDimensionName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.bodyText,
    marginBottom: 2,
  },
  riskScoreText: {
    fontFamily: "Courier-Bold",
    fontSize: 9,
  },
  riskBand: {
    fontSize: 7,
    color: COLORS.mutedText,
  },
  riskCommentary: {
    fontSize: 8,
    color: COLORS.secondaryText,
    lineHeight: 1.4,
    marginBottom: 3,
  },

  // ---- Value creation / investment thesis ----
  thesisCard: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  thesisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  thesisName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.bodyText,
  },
  thesisCommentary: {
    fontSize: 8.5,
    color: COLORS.secondaryText,
    lineHeight: 1.5,
    marginBottom: 5,
  },
  groupLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: COLORS.indigo,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
    marginTop: 5,
  },

  // ---- Key questions ----
  questionItem: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 5,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  questionNumber: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.indigo,
    width: 14,
    textAlign: "right",
    shrink: 0,
  },
  questionText: {
    flex: 1,
    fontSize: 8.5,
    color: COLORS.bodyText,
    lineHeight: 1.5,
  },

  // ---- Phase timeline (IP) ----
  phaseItem: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  phaseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.indigo,
    alignItems: "center",
    justifyContent: "center",
    shrink: 0,
    marginTop: 1,
  },
  phaseDotText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.white,
  },
  phaseText: {
    flex: 1,
    fontSize: 8.5,
    color: COLORS.secondaryText,
    lineHeight: 1.5,
  },

  // ---- Adjacent markets (IP) ----
  marketGrid: {
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },
  marketCard: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#c7d2fe",
    borderRadius: 4,
    padding: 6,
    backgroundColor: "#eef2ff",
  },
  marketName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.bodyText,
    marginBottom: 2,
  },
  marketTam: {
    fontFamily: "Courier",
    fontSize: 7.5,
    color: COLORS.indigo,
    marginBottom: 3,
  },
  marketRationale: {
    fontSize: 7.5,
    color: COLORS.secondaryText,
    lineHeight: 1.4,
  },

  // ---- Page footer ----
  footer: {
    position: "absolute",
    bottom: 16,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: COLORS.border,
    paddingTop: 5,
  },
  footerText: {
    fontSize: 7,
    color: COLORS.mutedText,
  },
  metadataFooter: {
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 7) return COLORS.green;
  if (score >= 5) return COLORS.amber;
  return COLORS.red;
}

function scoreBg(score: number): { backgroundColor: string; borderColor: string } {
  if (score >= 7) return { backgroundColor: COLORS.greenBg, borderColor: "#86efac" };
  if (score >= 5) return { backgroundColor: COLORS.amberBg, borderColor: "#fcd34d" };
  return { backgroundColor: COLORS.redBg, borderColor: "#fca5a5" };
}

function scoreBand(score: number): string {
  if (score >= 7) return "Strong";
  if (score >= 5) return "Adequate";
  if (score >= 3) return "Concerning";
  return "Deal-breaking";
}

function dealTypeLabel(dt: string): string {
  const map: Record<string, string> = {
    traditional_pe: "Traditional PE",
    ip_technology: "IP / Technology",
    growth_equity: "Growth Equity",
    venture: "Venture",
    real_estate: "Real Estate",
    credit: "Credit",
  };
  return map[dt] ?? dt;
}

function verdictLabel(v: string): string {
  if (v === "PROCEED") return "PROCEED";
  if (v === "FURTHER_REVIEW") return "FURTHER REVIEW";
  return "PASS";
}

function verdictBadgeStyle(v: string) {
  if (v === "PROCEED") return styles.proceedBadge;
  if (v === "FURTHER_REVIEW") return styles.furtherReviewBadge;
  return styles.passBadge;
}

function compositeScoreColor(score: number): string {
  if (score >= 7) return COLORS.green;
  if (score >= 5) return COLORS.amber;
  return COLORS.red;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function DimensionDetailCard({ label, section }: { label: string; section: ISTSection }) {
  const bg = scoreBg(section.score);
  return (
    <View style={[styles.dimensionCard, { borderColor: bg.borderColor, backgroundColor: bg.backgroundColor }]}>
      <View style={styles.dimensionHeader}>
        <Text style={styles.dimensionName}>{label}</Text>
        <Text style={[styles.dimensionScoreBadge, { color: scoreColor(section.score), backgroundColor: "transparent" }]}>
          {section.score}/10 — {scoreBand(section.score)}
        </Text>
      </View>
      <Text style={styles.dimensionCommentary}>{section.commentary}</Text>
      <BulletList items={section.keyFindings} />
    </View>
  );
}

function RiskTableRow({ section, isLast }: { section: ISTSection; isLast: boolean }) {
  return (
    <View style={[styles.riskTableRow, isLast ? styles.riskTableRowLast : {}]}>
      <View style={styles.riskColDimension}>
        <Text style={styles.riskDimensionName}>{section.sectionName}</Text>
      </View>
      <View style={styles.riskColScore}>
        <Text style={[styles.riskScoreText, { color: scoreColor(section.score) }]}>
          {section.score}/10
        </Text>
        <Text style={styles.riskBand}>{scoreBand(section.score)}</Text>
      </View>
      <View style={styles.riskColDetail}>
        <Text style={styles.riskCommentary}>{section.commentary}</Text>
        <BulletList items={section.keyFindings} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dimension label maps (mirrors ScreeningResultsPage.tsx)
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

const PE_DIMENSIONS: ISTDimension[] = [
  "companyOverview",
  "marketOpportunity",
  "financialProfile",
  "managementTeam",
  "investmentThesis",
  "riskAssessment",
  "dealDynamics",
];

type IPSnapshotKey =
  | "technologyReadiness"
  | "ipStrengthDefensibility"
  | "marketOpportunity"
  | "commercializationPathway"
  | "orthogonalApplicationPotential"
  | "valueCreationPotential"
  | "riskProfile"
  | "managementTeam"
  | "strategicFit";

const IP_DIMENSION_LABELS: Record<IPSnapshotKey, string> = {
  technologyReadiness: "Technology Readiness",
  ipStrengthDefensibility: "IP Strength & Defensibility",
  marketOpportunity: "Market Attractiveness",
  commercializationPathway: "Commercialization Pathway",
  orthogonalApplicationPotential: "Orthogonal Applications",
  valueCreationPotential: "Value Creation Potential",
  riskProfile: "Risk Profile",
  managementTeam: "Management Team",
  strategicFit: "Strategic Fit",
};

const IP_SNAPSHOT_KEYS: IPSnapshotKey[] = [
  "technologyReadiness",
  "ipStrengthDefensibility",
  "marketOpportunity",
  "commercializationPathway",
  "orthogonalApplicationPotential",
  "valueCreationPotential",
  "riskProfile",
  "managementTeam",
  "strategicFit",
];

function getIPDimensionScores(analysis: ISTAnalysis): Record<IPSnapshotKey, number | null> {
  return {
    technologyReadiness: analysis.technologyReadiness?.score ?? null,
    ipStrengthDefensibility: analysis.ipStrengthDefensibility?.score ?? null,
    marketOpportunity: analysis.marketOpportunity?.score ?? null,
    commercializationPathway: analysis.commercializationPathway?.score ?? null,
    orthogonalApplicationPotential: analysis.orthogonalApplicationPotential?.score ?? null,
    valueCreationPotential: analysis.investmentThesis?.score ?? null,
    riskProfile: analysis.riskAssessment?.score ?? null,
    managementTeam: analysis.managementTeam?.score ?? null,
    strategicFit: analysis.companyOverview?.score ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main PDF document
// ---------------------------------------------------------------------------

export interface ScreeningPDFProps {
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  screeningId: string;
}

export default function ScreeningPDF({ analysis, scoringResult, screeningId }: ScreeningPDFProps) {
  const { compositeScore, recommendation, isDisqualified, disqualifierReason, dimensionScores } =
    scoringResult;

  const isIPTech = analysis.dealType === "ip_technology";
  const ipDimensionScores = isIPTech ? getIPDimensionScores(analysis) : null;

  // Sorted dimensions for display — lowest score first
  const sortedPEDimensions = [...PE_DIMENSIONS].sort(
    (a, b) => dimensionScores[a] - dimensionScores[b],
  );

  // Risk table sections
  const riskSections: ISTSection[] = isIPTech && ipDimensionScores
    ? [
        analysis.riskAssessment,
        ...IP_SNAPSHOT_KEYS.filter(
          (k) => k !== "riskProfile" && ipDimensionScores[k] != null && (ipDimensionScores[k] as number) <= 6,
        )
          .sort((a, b) => (ipDimensionScores[a] ?? 0) - (ipDimensionScores[b] ?? 0))
          .map((k): ISTSection | undefined => {
            const sectionMap: Record<IPSnapshotKey, ISTSection | undefined> = {
              technologyReadiness: analysis.technologyReadiness,
              ipStrengthDefensibility: analysis.ipStrengthDefensibility,
              marketOpportunity: analysis.marketOpportunity,
              commercializationPathway: analysis.commercializationPathway,
              orthogonalApplicationPotential: analysis.orthogonalApplicationPotential,
              valueCreationPotential: analysis.investmentThesis,
              riskProfile: analysis.riskAssessment,
              managementTeam: analysis.managementTeam,
              strategicFit: analysis.companyOverview,
            };
            return sectionMap[k];
          })
          .filter((s): s is ISTSection => s !== undefined),
      ]
    : [
        analysis.riskAssessment,
        ...PE_DIMENSIONS.filter(
          (d) => d !== "riskAssessment" && dimensionScores[d] <= 6,
        )
          .sort((a, b) => dimensionScores[a] - dimensionScores[b])
          .map((d) => analysis[d]),
      ];

  // Split PE dimension cards into two columns for layout
  const leftColDims = sortedPEDimensions.filter((_, i) => i % 2 === 0);
  const rightColDims = sortedPEDimensions.filter((_, i) => i % 2 !== 0);

  const footerDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document
      title={`${analysis.companyName} — IST Screening Report`}
      author="IST Screener — Catalyze Partners"
      subject="Investment Screening Test"
    >
      <Page size="A4" style={styles.page}>
        {/* ---------------------------------------------------------------- */}
        {/* HEADER                                                            */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.header}>
          <Text style={styles.companyName}>{analysis.companyName}</Text>
          <View style={styles.headerMeta}>
            <Text style={[styles.badge, styles.dealTypeBadge]}>
              {dealTypeLabel(analysis.dealType)}
            </Text>
            <Text style={[styles.badge, verdictBadgeStyle(recommendation)]}>
              {verdictLabel(recommendation)}
            </Text>
            {isDisqualified && (
              <Text style={[styles.badge, styles.disqualifiedBadge]}>DISQUALIFIED</Text>
            )}
          </View>

          <View style={styles.scoreRow}>
            <Text style={[styles.compositeScore, { color: compositeScoreColor(compositeScore) }]}>
              {compositeScore.toFixed(1)}
            </Text>
            <Text style={styles.compositeScoreLabel}> / 10</Text>
          </View>
          <Text style={styles.headerDate}>Analysis Date: {analysis.analysisDate}</Text>
          {isDisqualified && disqualifierReason && (
            <Text style={[styles.headerDate, { color: "#fca5a5", marginTop: 4 }]}>
              Disqualifier: {disqualifierReason}
            </Text>
          )}
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* EXECUTIVE SUMMARY                                                 */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={styles.summaryText}>{analysis.executiveSummary}</Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* INVESTMENT SNAPSHOT — dimension score grid                         */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Investment Snapshot</Text>
          <View style={styles.snapshotGrid}>
            {isIPTech && ipDimensionScores
              ? IP_SNAPSHOT_KEYS.filter((k) => ipDimensionScores[k] !== null).map((key) => {
                  const score = ipDimensionScores[key] as number;
                  const bg = scoreBg(score);
                  return (
                    <View
                      key={key}
                      style={[
                        styles.snapshotCell,
                        { backgroundColor: bg.backgroundColor, borderColor: bg.borderColor },
                      ]}
                    >
                      <Text style={[styles.snapshotScore, { color: scoreColor(score) }]}>
                        {score}
                      </Text>
                      <Text style={styles.snapshotLabel}>{IP_DIMENSION_LABELS[key]}</Text>
                    </View>
                  );
                })
              : PE_DIMENSIONS.map((dim) => {
                  const score = dimensionScores[dim];
                  const bg = scoreBg(score);
                  return (
                    <View
                      key={dim}
                      style={[
                        styles.snapshotCell,
                        { backgroundColor: bg.backgroundColor, borderColor: bg.borderColor },
                      ]}
                    >
                      <Text style={[styles.snapshotScore, { color: scoreColor(score) }]}>
                        {score}
                      </Text>
                      <Text style={styles.snapshotLabel}>{DIMENSION_LABELS[dim]}</Text>
                    </View>
                  );
                })}
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* DIMENSION SCORE DETAILS — two-column layout                       */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dimension Scores (lowest first)</Text>
          {isIPTech && ipDimensionScores
            ? (() => {
                // IP track: show sections in a single column
                const sorted = IP_SNAPSHOT_KEYS.filter(
                  (k) => ipDimensionScores[k] !== null,
                ).sort((a, b) => (ipDimensionScores[a] ?? 0) - (ipDimensionScores[b] ?? 0));
                const left = sorted.filter((_, i) => i % 2 === 0);
                const right = sorted.filter((_, i) => i % 2 !== 0);
                const sectionMap: Record<IPSnapshotKey, ISTSection | undefined> = {
                  technologyReadiness: analysis.technologyReadiness,
                  ipStrengthDefensibility: analysis.ipStrengthDefensibility,
                  marketOpportunity: analysis.marketOpportunity,
                  commercializationPathway: analysis.commercializationPathway,
                  orthogonalApplicationPotential: analysis.orthogonalApplicationPotential,
                  valueCreationPotential: analysis.investmentThesis,
                  riskProfile: analysis.riskAssessment,
                  managementTeam: analysis.managementTeam,
                  strategicFit: analysis.companyOverview,
                };
                return (
                  <View style={styles.twoColumnGrid}>
                    <View style={styles.column}>
                      {left.map((key) => {
                        const sec = sectionMap[key];
                        if (!sec) return null;
                        return (
                          <DimensionDetailCard
                            key={key}
                            label={IP_DIMENSION_LABELS[key]}
                            section={sec}
                          />
                        );
                      })}
                    </View>
                    <View style={styles.column}>
                      {right.map((key) => {
                        const sec = sectionMap[key];
                        if (!sec) return null;
                        return (
                          <DimensionDetailCard
                            key={key}
                            label={IP_DIMENSION_LABELS[key]}
                            section={sec}
                          />
                        );
                      })}
                    </View>
                  </View>
                );
              })()
            : (
              <View style={styles.twoColumnGrid}>
                <View style={styles.column}>
                  {leftColDims.map((dim) => (
                    <DimensionDetailCard
                      key={dim}
                      label={DIMENSION_LABELS[dim]}
                      section={analysis[dim]}
                    />
                  ))}
                </View>
                <View style={styles.column}>
                  {rightColDims.map((dim) => (
                    <DimensionDetailCard
                      key={dim}
                      label={DIMENSION_LABELS[dim]}
                      section={analysis[dim]}
                    />
                  ))}
                </View>
              </View>
            )}
        </View>

        {/* Page footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {analysis.companyName} — IST Screening Report
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
          <Text style={styles.footerText}>{footerDate}</Text>
        </View>
      </Page>

      {/* ------------------------------------------------------------------ */}
      {/* PAGE 2 — RISK ASSESSMENT + VALUE CREATION + KEY QUESTIONS           */}
      {/* ------------------------------------------------------------------ */}
      <Page size="A4" style={styles.page}>

        {/* ---------------------------------------------------------------- */}
        {/* RISK ASSESSMENT TABLE                                             */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risk Assessment</Text>
          <View style={styles.riskTable}>
            <View style={styles.riskTableHead}>
              <Text style={[styles.riskTableHeadCell, styles.riskColDimension]}>
                Dimension
              </Text>
              <Text style={[styles.riskTableHeadCell, styles.riskColScore]}>Score</Text>
              <Text style={[styles.riskTableHeadCell, styles.riskColDetail]}>
                Commentary &amp; Key Findings
              </Text>
            </View>
            {riskSections.map((section, i) => (
              <RiskTableRow
                key={i}
                section={section}
                isLast={i === riskSections.length - 1}
              />
            ))}
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* VALUE CREATION — PE: Investment Thesis  / IP: Commercialization    */}
        {/* ---------------------------------------------------------------- */}
        {isIPTech ? (
          <>
            {/* Commercialization Pathway */}
            {analysis.commercializationPathway && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Commercialization Pathway</Text>
                <View style={styles.thesisCard}>
                  <View style={styles.thesisHeader}>
                    <Text style={styles.thesisName}>Commercialization Pathway</Text>
                    <Text
                      style={[
                        styles.dimensionScoreBadge,
                        { color: scoreColor(analysis.commercializationPathway.score) },
                      ]}
                    >
                      {analysis.commercializationPathway.score}/10
                    </Text>
                  </View>
                  <Text style={styles.thesisCommentary}>
                    {analysis.commercializationPathway.commentary}
                  </Text>
                  {(analysis.commercializationPathway.phaseTimeline ?? []).length > 0 && (
                    <View>
                      <Text style={styles.groupLabel}>Phase Timeline</Text>
                      {(analysis.commercializationPathway.phaseTimeline ?? []).map((phase, i) => (
                        <View key={i} style={styles.phaseItem}>
                          <View style={styles.phaseDot}>
                            <Text style={styles.phaseDotText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.phaseText}>{phase}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {analysis.commercializationPathway.keyFindings.length > 0 && (
                    <>
                      <Text style={styles.groupLabel}>Key Findings</Text>
                      <BulletList items={analysis.commercializationPathway.keyFindings} />
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Orthogonal Applications */}
            {analysis.orthogonalApplicationPotential && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Orthogonal Applications</Text>
                <View style={styles.thesisCard}>
                  <Text style={styles.thesisCommentary}>
                    {analysis.orthogonalApplicationPotential.commentary}
                  </Text>
                  {(analysis.orthogonalApplicationPotential.adjacentMarkets ?? []).length > 0 && (
                    <View style={styles.marketGrid}>
                      {(analysis.orthogonalApplicationPotential.adjacentMarkets ?? []).map(
                        (m, i) => (
                          <View key={i} style={styles.marketCard}>
                            <Text style={styles.marketName}>{m.market}</Text>
                            <Text style={styles.marketTam}>{m.tamEstimate}</Text>
                            <Text style={styles.marketRationale}>{m.rationale}</Text>
                          </View>
                        ),
                      )}
                    </View>
                  )}
                  {analysis.orthogonalApplicationPotential.keyFindings.length > 0 && (
                    <>
                      <Text style={[styles.groupLabel, { marginTop: 8 }]}>Key Findings</Text>
                      <BulletList items={analysis.orthogonalApplicationPotential.keyFindings} />
                    </>
                  )}
                </View>
              </View>
            )}
          </>
        ) : (
          /* PE track: Investment Thesis (value creation) */
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Value Creation Thesis</Text>
            <View style={styles.thesisCard}>
              <View style={styles.thesisHeader}>
                <Text style={styles.thesisName}>Investment Thesis</Text>
                <Text
                  style={[
                    styles.dimensionScoreBadge,
                    { color: scoreColor(analysis.investmentThesis.score) },
                  ]}
                >
                  {analysis.investmentThesis.score}/10
                </Text>
              </View>
              <Text style={styles.thesisCommentary}>{analysis.investmentThesis.commentary}</Text>
              {analysis.investmentThesis.keyFindings.length > 0 && (
                <BulletList items={analysis.investmentThesis.keyFindings} />
              )}
            </View>
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* KEY MANAGEMENT QUESTIONS                                          */}
        {/* PE: from dealDynamics key findings  / IP: from IP section findings */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Management Questions</Text>
          {isIPTech ? (
            /* IP track: surface questions from IP-specific sections */
            (() => {
              const questions: string[] = [
                ...(analysis.technologyReadiness?.keyFindings ?? []),
                ...(analysis.ipStrengthDefensibility?.keyFindings ?? []),
                ...(analysis.commercializationPathway?.keyFindings ?? []),
              ];
              if (questions.length === 0) {
                questions.push(...analysis.managementTeam.keyFindings);
              }
              return questions.map((q, i) => (
                <View key={i} style={styles.questionItem}>
                  <Text style={styles.questionNumber}>{i + 1}.</Text>
                  <Text style={styles.questionText}>{q}</Text>
                </View>
              ));
            })()
          ) : (
            /* PE track: dealDynamics key findings serve as management questions */
            analysis.dealDynamics.keyFindings.map((q, i) => (
              <View key={i} style={styles.questionItem}>
                <Text style={styles.questionNumber}>{i + 1}.</Text>
                <Text style={styles.questionText}>{q}</Text>
              </View>
            ))
          )}
        </View>

        {/* Screening metadata footer */}
        <View style={styles.metadataFooter}>
          <Text style={styles.footerText}>
            Screening ID: {screeningId} · Generated by IST Screener — Catalyze Partners · {footerDate}
          </Text>
        </View>

        {/* Page footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {analysis.companyName} — IST Screening Report
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
          <Text style={styles.footerText}>{footerDate}</Text>
        </View>
      </Page>
    </Document>
  );
}
