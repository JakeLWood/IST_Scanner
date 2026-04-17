"use server";

/**
 * shareViaEmail — Next.js Server Action
 *
 * Sends a formatted IST screening summary email via the Resend API.
 * The Claude API key and Resend API key are never exposed to the browser —
 * all API calls happen exclusively on the server (PRD §2.4).
 */

import { Resend } from "resend";
import type { ISTAnalysis } from "../../types/ist-analysis";
import type { ScoringResult, FinalRecommendation } from "../scoringEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareEmailPayload {
  /** Recipient email addresses (1–10). */
  recipients: string[];
  /** Optional personal note to include in the email. */
  note?: string;
  /** Full IST analysis to summarise in the email. */
  analysis: ISTAnalysis;
  /** Scoring result (composite score + recommendation). */
  scoringResult: ScoringResult;
  /** The Supabase screening UUID — used to build the deep-link URL. */
  screeningId: string;
}

export interface ShareEmailResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
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
// HTML email builder
// ---------------------------------------------------------------------------

function buildEmailHtml(payload: ShareEmailPayload): string {
  const { analysis, scoringResult, screeningId, note } = payload;
  const { compositeScore, recommendation, dimensionScores } = scoringResult;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://app.istscreener.com";
  const screeningUrl = `${appUrl}/screenings/${screeningId}`;
  const recColor = recommendationColor(recommendation);
  const recLabel = recommendationLabel(recommendation);

  // --- top 3 strengths ---
  const topStrengths = Object.entries(dimensionScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([dim, score]) => {
      const section = analysis[dim as keyof ISTAnalysis];
      const sectionName =
        section &&
        typeof section === "object" &&
        "sectionName" in section &&
        typeof section.sectionName === "string"
          ? section.sectionName
          : dim;
      return { sectionName, score };
    });

  // --- top 3 risks (lowest-scoring dimensions) ---
  const topRisks = Object.entries(dimensionScores)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 3)
    .map(([dim, score]) => {
      const section = analysis[dim as keyof ISTAnalysis];
      const sectionName =
        section &&
        typeof section === "object" &&
        "sectionName" in section &&
        typeof section.sectionName === "string"
          ? section.sectionName
          : dim;
      const commentary =
        section &&
        typeof section === "object" &&
        "commentary" in section &&
        typeof section.commentary === "string"
          ? section.commentary
          : "";
      return { sectionName, score, commentary };
    });

  const strengthRows = topStrengths
    .map(
      ({ sectionName, score }) => `
      <tr>
        <td style="padding:6px 12px;font-size:13px;color:#E2E8F0;">${sectionName}</td>
        <td style="padding:6px 12px;font-size:13px;font-family:monospace;color:${scoreColor(score)};font-weight:700;text-align:right;">${score}/10</td>
      </tr>`,
    )
    .join("");

  const riskRows = topRisks
    .map(
      ({ sectionName, score, commentary }) => `
      <tr>
        <td style="padding:8px 12px;vertical-align:top;">
          <div style="font-size:13px;font-weight:600;color:#E2E8F0;">${sectionName} <span style="font-family:monospace;color:${scoreColor(score)};">(${score}/10)</span></div>
          ${commentary ? `<div style="font-size:12px;color:#94A3B8;margin-top:3px;">${commentary}</div>` : ""}
        </td>
      </tr>`,
    )
    .join("");

  const noteSection = note?.trim()
    ? `
    <tr><td style="padding:16px 24px 0;">
      <div style="background:#1E293B;border:1px solid #334155;border-radius:8px;padding:14px 16px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Note from sender</p>
        <p style="margin:0;font-size:13px;color:#CBD5E1;white-space:pre-wrap;">${note.trim()}</p>
      </div>
    </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IST Screening — ${analysis.companyName}</title>
</head>
<body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1E293B;border-radius:12px;overflow:hidden;border:1px solid #334155;">

        <!-- Header bar -->
        <tr>
          <td style="background:#1E40AF;padding:18px 24px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#BFDBFE;">Catalyze Partners · IST Screener</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;">${analysis.companyName}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#93C5FD;">${dealTypeLabel(analysis.dealType)}</p>
          </td>
        </tr>

        <!-- Recommendation + score hero -->
        <tr>
          <td style="padding:24px 24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding-right:8px;">
                  <div style="background:#0F172A;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Recommendation</p>
                    <p style="margin:0;font-size:16px;font-weight:800;color:${recColor};">${recLabel}</p>
                  </div>
                </td>
                <td style="width:50%;padding-left:8px;">
                  <div style="background:#0F172A;border:1px solid #334155;border-radius:8px;padding:16px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Composite Score</p>
                    <p style="margin:0;font-size:28px;font-weight:800;font-family:monospace;color:${scoreColor(compositeScore)};">${compositeScore.toFixed(1)}<span style="font-size:14px;color:#64748B;">/10</span></p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Note from sender (if provided) -->
        ${noteSection}

        <!-- Executive summary -->
        <tr>
          <td style="padding:20px 24px 0;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Executive Summary</p>
            <p style="margin:0;font-size:13px;color:#CBD5E1;line-height:1.6;">${analysis.executiveSummary}</p>
          </td>
        </tr>

        <!-- Top strengths -->
        <tr>
          <td style="padding:20px 24px 0;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;">Top Scoring Dimensions</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;border:1px solid #334155;border-radius:8px;overflow:hidden;">
              ${strengthRows}
            </table>
          </td>
        </tr>

        <!-- Key risks -->
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
          <td style="padding:24px;text-align:center;">
            <a href="${screeningUrl}" style="display:inline-block;background:#4F46E5;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">View Full Screening →</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0F172A;padding:14px 24px;border-top:1px solid #1E293B;">
            <p style="margin:0;font-size:11px;color:#475569;text-align:center;">This screening was generated by the Catalyze Partners IST Screener. <a href="${screeningUrl}" style="color:#6366F1;text-decoration:none;">View in app</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

/**
 * Sends a screening summary email to one or more recipients via Resend.
 *
 * Security: the RESEND_API_KEY is read exclusively from the server-side
 * environment and is never exposed to the client bundle (PRD §2.4).
 */
export async function shareViaEmail(
  payload: ShareEmailPayload,
): Promise<ShareEmailResult> {
  // --- Validate recipients ---
  if (!payload.recipients || payload.recipients.length === 0) {
    return { success: false, error: "At least one recipient is required." };
  }
  if (payload.recipients.length > 10) {
    return {
      success: false,
      error: "A maximum of 10 recipients is allowed per send.",
    };
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const addr of payload.recipients) {
    if (!emailRe.test(addr.trim())) {
      return {
        success: false,
        error: `Invalid email address: ${addr.trim()}`,
      };
    }
  }

  // --- Resolve API key ---
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error:
        "Email sending is not configured. Please set RESEND_API_KEY in your environment.",
    };
  }

  const fromAddress =
    process.env.RESEND_FROM_EMAIL ?? "IST Screener <noreply@istscreener.com>";

  const { analysis, scoringResult } = payload;
  const { recommendation, compositeScore } = scoringResult;
  const subject = `IST Screening: ${analysis.companyName} — ${recommendationLabel(recommendation)} (${compositeScore.toFixed(1)}/10)`;

  const html = buildEmailHtml(payload);

  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: payload.recipients.map((r) => r.trim()),
      subject,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email.",
    };
  }
}
