/**
 * buildIntakeResultEmail
 *
 * Builds the HTML email sent back to the user after their emailed deal document
 * has been processed by the IST Screener (PRD §8.2 — Email Forwarding Stretch Goal).
 *
 * The email includes:
 *  - Recommendation verdict + composite score (the "hero" metrics)
 *  - Executive summary
 *  - Top 3 highest-scoring dimensions (strengths)
 *  - Top 3 lowest-scoring dimensions (areas requiring attention)
 *  - A CTA button linking to the full screening results in the web app
 */

import type { ISTAnalysis } from "../../types/ist-analysis";
import type { ScoringResult, FinalRecommendation } from "../scoringEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntakeResultEmailPayload {
  analysis: ISTAnalysis;
  scoringResult: ScoringResult;
  screeningId: string;
  /** Greeting name for the email (user's display name or null). */
  senderName: string | null;
  /** Base URL of the application, e.g. https://app.istscreener.com */
  appUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers (mirrors conventions in lib/actions/shareViaEmail.ts)
// ---------------------------------------------------------------------------

function recommendationLabel(r: FinalRecommendation): string {
  switch (r) {
    case "PROCEED":
      return "✅ PROCEED";
    case "FURTHER_REVIEW":
      return "⚠️ FURTHER REVIEW";
    case "PASS":
      return "❌ PASS";
  }
}

function recommendationColor(r: FinalRecommendation): string {
  switch (r) {
    case "PROCEED":
      return "#22C55E";
    case "FURTHER_REVIEW":
      return "#F59E0B";
    case "PASS":
      return "#EF4444";
  }
}

function scoreColor(score: number): string {
  if (score >= 7) return "#22C55E";
  if (score >= 5) return "#F59E0B";
  return "#EF4444";
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

// ---------------------------------------------------------------------------
// Email builder
// ---------------------------------------------------------------------------

/**
 * Builds the HTML email body for a completed email-intake IST screening.
 *
 * @param payload - Analysis results and display metadata.
 * @returns HTML string suitable for sending via Resend.
 */
export function buildIntakeResultEmail(payload: IntakeResultEmailPayload): string {
  const { analysis, scoringResult, screeningId, senderName, appUrl } = payload;
  const { compositeScore, recommendation, dimensionScores } = scoringResult;

  const screeningUrl = `${appUrl}/screenings/${screeningId}`;
  const recColor = recommendationColor(recommendation);
  const recLabel = recommendationLabel(recommendation);

  // Greeting
  const greeting = senderName
    ? `Hi ${senderName.split(" ")[0]},`
    : "Hello,";

  // Top 3 highest-scoring dimensions
  const topStrengths = Object.entries(dimensionScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([dim, score]) => {
      const section = analysis[dim as keyof ISTAnalysis];
      const sectionName =
        section && typeof section === "object" && "sectionName" in section
          ? String(section.sectionName)
          : dim;
      return { sectionName, score };
    });

  // Top 3 lowest-scoring dimensions
  const topRisks = Object.entries(dimensionScores)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 3)
    .map(([dim, score]) => {
      const section = analysis[dim as keyof ISTAnalysis];
      const sectionName =
        section && typeof section === "object" && "sectionName" in section
          ? String(section.sectionName)
          : dim;
      const commentary =
        section && typeof section === "object" && "commentary" in section
          ? String(section.commentary)
          : "";
      return { sectionName, score, commentary };
    });

  const strengthRows = topStrengths
    .map(
      ({ sectionName, score }) => `
      <tr>
        <td style="padding:8px 14px;font-size:13px;color:#E2E8F0;border-bottom:1px solid #1E293B;">${sectionName}</td>
        <td style="padding:8px 14px;font-size:13px;font-family:monospace;color:${scoreColor(score)};font-weight:700;text-align:right;border-bottom:1px solid #1E293B;">${score}/10</td>
      </tr>`,
    )
    .join("");

  const riskRows = topRisks
    .map(
      ({ sectionName, score, commentary }) => `
      <tr>
        <td style="padding:10px 14px;vertical-align:top;border-bottom:1px solid #1E293B;">
          <div style="font-size:13px;font-weight:600;color:#E2E8F0;">${sectionName} <span style="font-family:monospace;color:${scoreColor(score)};">(${score}/10)</span></div>
          ${commentary ? `<div style="font-size:12px;color:#94A3B8;margin-top:4px;line-height:1.5;">${commentary.slice(0, 200)}${commentary.length > 200 ? "…" : ""}</div>` : ""}
        </td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IST Screening Results — ${analysis.companyName}</title>
</head>
<body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1E293B;border-radius:12px;overflow:hidden;border:1px solid #334155;">

        <!-- Header -->
        <tr>
          <td style="background:#1E40AF;padding:20px 24px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#BFDBFE;">Catalyze Partners · IST Screener</p>
            <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#FFFFFF;">${analysis.companyName}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#93C5FD;">${dealTypeLabel(analysis.dealType)} · Screened via Email</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:20px 24px 0;">
            <p style="margin:0;font-size:14px;color:#CBD5E1;">${greeting}</p>
            <p style="margin:8px 0 0;font-size:14px;color:#CBD5E1;">Your IST screening for <strong>${analysis.companyName}</strong> is complete. Here is a summary of the results.</p>
          </td>
        </tr>

        <!-- Recommendation + Score hero -->
        <tr>
          <td style="padding:20px 24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding-right:8px;">
                  <div style="background:#0F172A;border:1px solid #334155;border-radius:8px;padding:18px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Recommendation</p>
                    <p style="margin:0;font-size:15px;font-weight:800;color:${recColor};">${recLabel}</p>
                  </div>
                </td>
                <td style="width:50%;padding-left:8px;">
                  <div style="background:#0F172A;border:1px solid #334155;border-radius:8px;padding:18px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Composite Score</p>
                    <p style="margin:0;font-size:30px;font-weight:800;font-family:monospace;color:${scoreColor(compositeScore)};">${compositeScore.toFixed(1)}<span style="font-size:14px;color:#64748B;">/10</span></p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Executive summary -->
        <tr>
          <td style="padding:20px 24px 0;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Executive Summary</p>
            <p style="margin:0;font-size:13px;color:#CBD5E1;line-height:1.65;">${analysis.executiveSummary}</p>
          </td>
        </tr>

        <!-- Top scoring dimensions -->
        <tr>
          <td style="padding:20px 24px 0;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Top Scoring Dimensions</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;border:1px solid #334155;border-radius:8px;overflow:hidden;">
              ${strengthRows}
            </table>
          </td>
        </tr>

        <!-- Areas requiring attention -->
        <tr>
          <td style="padding:20px 24px 0;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Areas Requiring Attention</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;border:1px solid #334155;border-radius:8px;overflow:hidden;">
              ${riskRows}
            </table>
          </td>
        </tr>

        <!-- CTA button -->
        <tr>
          <td style="padding:28px 24px;text-align:center;">
            <a href="${screeningUrl}" style="display:inline-block;background:#4F46E5;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:8px;">View Full Screening Results →</a>
            <p style="margin:14px 0 0;font-size:12px;color:#64748B;">The complete analysis — including all 7 scored dimensions and key findings — is available in the IST Screener platform.</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0F172A;padding:14px 24px;border-top:1px solid #1E293B;">
            <p style="margin:0;font-size:11px;color:#475569;text-align:center;">
              Generated by the Catalyze Partners IST Screener via email intake. ·
              <a href="${screeningUrl}" style="color:#6366F1;text-decoration:none;">View in app</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
