/**
 * POST /api/email-intake
 *
 * Resend inbound email webhook handler (PRD §8.2 — Email Forwarding Stretch Goal).
 *
 * Resend delivers emails sent to screen@catalyze.partners as a POST request to
 * this endpoint. Configure the webhook URL in your Resend Inbound settings.
 *
 * Webhook signature verification:
 *   Resend signs inbound webhooks using Svix. The handler verifies the
 *   `svix-signature` header with HMAC-SHA256 using RESEND_WEBHOOK_SECRET.
 *
 * Processing flow:
 *   1. Verify the webhook signature to reject spoofed requests.
 *   2. Deduplicate on Resend's email_id to prevent double-processing.
 *   3. Extract text from PDF / DOCX attachments; fall back to the email body.
 *   4. Look up the sender by email in the `users` table.
 *   5a. Registered sender  → run IST analysis, save screening, email results.
 *   5b. Unregistered sender → queue the email, notify admins.
 */

import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";
import { analyzeDocument } from "@/lib/ai/analyzeDocument";
import { scoreAnalysis, DEFAULT_WEIGHTS } from "@/lib/scoringEngine";
import { buildIntakeResultEmail } from "@/lib/email/buildIntakeResultEmail";

// ---------------------------------------------------------------------------
// Types — Resend inbound email webhook payload
// ---------------------------------------------------------------------------

interface ResendAttachment {
  filename: string;
  /** Base64-encoded file content */
  content: string;
  content_type: string;
}

interface ResendInboundEmailData {
  email_id: string;
  from: string;
  to: string | string[];
  subject?: string;
  /** Plain-text email body */
  text?: string;
  /** HTML email body */
  html?: string;
  attachments?: ResendAttachment[];
  /** Raw date header from the email */
  date?: string;
}

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: ResendInboundEmailData;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Svix HMAC-SHA256)
// ---------------------------------------------------------------------------

/**
 * Verifies the Svix-style webhook signature that Resend attaches to every
 * inbound email webhook delivery.
 *
 * @see https://docs.resend.com/knowledge-base/webhook-signature-validation
 *
 * Returns `true` when the signature is valid, `false` otherwise.
 * Always returns `true` when `RESEND_WEBHOOK_SECRET` is not configured
 * (to allow local development without secrets) — logs a warning.
 */
function verifyWebhookSignature(
  body: string,
  headers: Headers,
): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[email-intake] RESEND_WEBHOOK_SECRET is not set — skipping signature verification.",
    );
    return true;
  }

  const svixId = headers.get("svix-id") ?? "";
  const svixTimestamp = headers.get("svix-timestamp") ?? "";
  const svixSignature = headers.get("svix-signature") ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Replay attack prevention: reject requests older than 5 minutes.
  const timestampSeconds = parseInt(svixTimestamp, 10);
  if (isNaN(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > 300) return false;

  // Svix signature format: HMAC-SHA256(secret, `${svix-id}.${svix-timestamp}.${body}`)
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  // Svix secrets are base64-encoded; strip the "whsec_" prefix before decoding.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const computed = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent, "utf8")
    .digest("base64");

  // svix-signature may contain multiple space-separated `v1,<base64>` values.
  const expectedSignatures = svixSignature
    .split(" ")
    .map((s) => s.replace(/^v1,/, ""));

  return expectedSignatures.some((sig) =>
    crypto.timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(computed, "base64")),
  );
}

// ---------------------------------------------------------------------------
// Text extraction from email attachments
// ---------------------------------------------------------------------------

/**
 * Extracts plain text from a base64-encoded PDF or DOCX attachment.
 * Returns `null` for unsupported file types or when extraction fails.
 */
async function extractTextFromAttachment(
  attachment: ResendAttachment,
): Promise<string | null> {
  const ext = attachment.filename.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(attachment.content, "base64");

  if (ext === "pdf" || attachment.content_type === "application/pdf") {
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      const text = result.text.trim();
      return text.length > 0 ? text : null;
    } catch (err) {
      console.error("[email-intake] PDF extraction failed:", err);
      return null;
    }
  }

  if (
    ext === "docx" ||
    attachment.content_type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      return text.length > 0 ? text : null;
    } catch (err) {
      console.error("[email-intake] DOCX extraction failed:", err);
      return null;
    }
  }

  if (ext === "txt" || attachment.content_type?.startsWith("text/")) {
    return buffer.toString("utf8").trim() || null;
  }

  return null;
}

/**
 * Extracts the best available text from an inbound email:
 *   1. PDF / DOCX attachments (concatenated, largest first)
 *   2. Email body (plain text preferred, HTML stripped as fallback)
 *
 * Returns an empty string when no text can be extracted.
 */
async function extractBestText(data: ResendInboundEmailData): Promise<string> {
  const parts: string[] = [];

  // Attempt attachment extraction first
  const attachments = data.attachments ?? [];
  const supportedExts = new Set(["pdf", "docx", "txt"]);
  const supportedAttachments = attachments.filter((a) => {
    const ext = a.filename.split(".").pop()?.toLowerCase() ?? "";
    return supportedExts.has(ext) || a.content_type?.startsWith("text/");
  });

  for (const attachment of supportedAttachments) {
    const text = await extractTextFromAttachment(attachment);
    if (text) parts.push(text);
  }

  // If no attachment text was found, use the email body as fallback
  if (parts.length === 0) {
    if (data.text?.trim()) {
      parts.push(data.text.trim());
    } else if (data.html?.trim()) {
      // Strip HTML tags for a rough plain-text fallback
      const stripped = data.html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (stripped) parts.push(stripped);
    }
  }

  return parts.join("\n\n").trim();
}

// ---------------------------------------------------------------------------
// Sender email normalisation
// ---------------------------------------------------------------------------

/**
 * Extracts the email address from a "Name <email>" formatted string,
 * or returns the raw string if it's already a plain email address.
 */
function parseEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

function parseSenderName(raw: string): string | null {
  const match = raw.match(/^([^<]+)<[^>]+>/);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Admin notification email
// ---------------------------------------------------------------------------

async function notifyAdmins(
  resend: Resend,
  fromAddress: string,
  senderEmail: string,
  senderName: string | null,
  subject: string | undefined,
  queueId: string,
  appUrl: string,
): Promise<void> {
  const adminEmails = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmails) return;

  const recipients = adminEmails.split(",").map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) return;

  const displayName = senderName ? `${senderName} (${senderEmail})` : senderEmail;
  const queueUrl = `${appUrl}/admin/email-intake/${queueId}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Unregistered Email Intake</title></head>
<body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1E293B;border-radius:12px;overflow:hidden;border:1px solid #334155;">
        <tr><td style="background:#7C3AED;padding:18px 24px;">
          <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#DDD6FE;">Catalyze Partners · IST Screener</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#FFFFFF;">Unregistered Email Screening Request</p>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 16px;font-size:14px;color:#CBD5E1;">An email was received at <strong>screen@catalyze.partners</strong> from a sender who is not registered in the IST Screener.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;border:1px solid #334155;border-radius:8px;overflow:hidden;margin-bottom:20px;">
            <tr><td style="padding:10px 14px;border-bottom:1px solid #1E293B;">
              <span style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">From</span>
              <p style="margin:4px 0 0;font-size:13px;color:#E2E8F0;">${displayName}</p>
            </td></tr>
            <tr><td style="padding:10px 14px;">
              <span style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">Subject</span>
              <p style="margin:4px 0 0;font-size:13px;color:#E2E8F0;">${subject ?? "(no subject)"}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:13px;color:#94A3B8;">The email has been queued and is waiting for admin review. You can view the full content and decide whether to process it manually or invite the sender to register.</p>
          <a href="${queueUrl}" style="display:inline-block;background:#4F46E5;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">Review Queued Email →</a>
        </td></tr>
        <tr><td style="background:#0F172A;padding:14px 24px;border-top:1px solid #1E293B;">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center;">IST Screener Admin Notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject: `[IST Screener] Unregistered sender: ${senderEmail}`,
      html,
    });
  } catch (err) {
    console.error("[email-intake] Failed to send admin notification:", err);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Read raw body for signature verification (must happen before .json())
  const rawBody = await req.text();

  // 2. Verify webhook signature
  if (!verifyWebhookSignature(rawBody, req.headers)) {
    console.error("[email-intake] Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  // 3. Parse payload
  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // Only handle inbound email events
  if (payload.type !== "email.received") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const data = payload.data;
  const senderRaw = data.from ?? "";
  const senderEmail = parseEmailAddress(senderRaw);
  const senderName = parseSenderName(senderRaw);

  if (!senderEmail) {
    return NextResponse.json({ error: "Could not parse sender email" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const resend = new Resend(process.env.RESEND_API_KEY ?? "");
  const fromAddress =
    process.env.RESEND_FROM_EMAIL ?? "IST Screener <noreply@catalyze.partners>";
  const appUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.istscreener.com").replace(/\/$/, "");

  // 4. Deduplicate on Resend email_id
  if (data.email_id) {
    const { data: existing } = await serviceClient
      .from("email_intake_queue")
      .select("id")
      .eq("resend_email_id", data.email_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ received: true, deduplicated: true }, { status: 200 });
    }
  }

  // 5. Extract text from attachments / body
  const extractedText = await extractBestText(data);

  if (!extractedText) {
    console.warn("[email-intake] No extractable text found in email from:", senderEmail);
    return NextResponse.json({ received: true, warning: "No text extracted" }, { status: 200 });
  }

  // 6. Look up the sender in the users table
  const { data: user } = await serviceClient
    .from("users")
    .select("id, email, name, role")
    .eq("email", senderEmail)
    .eq("is_active", true)
    .maybeSingle();

  // ─── 7a. Unregistered sender ────────────────────────────────────────────────
  if (!user) {
    // Save to the intake queue for admin review
    const { data: queued, error: queueError } = await serviceClient
      .from("email_intake_queue")
      .insert({
        sender_email: senderEmail,
        sender_name: senderName,
        subject: data.subject ?? null,
        raw_text: extractedText,
        status: "pending",
        email_date: data.date ?? null,
        resend_email_id: data.email_id ?? null,
        admin_notified: false,
      })
      .select("id")
      .single();

    if (queueError) {
      console.error("[email-intake] Failed to queue email:", queueError.message);
      return NextResponse.json({ error: "Failed to queue email" }, { status: 500 });
    }

    // Notify admins
    await notifyAdmins(
      resend,
      fromAddress,
      senderEmail,
      senderName,
      data.subject,
      queued.id as string,
      appUrl,
    );

    // Mark admin_notified
    await serviceClient
      .from("email_intake_queue")
      .update({ admin_notified: true })
      .eq("id", queued.id);

    // Reply to the unregistered sender
    try {
      await resend.emails.send({
        from: fromAddress,
        to: [senderEmail],
        subject: "Your screening request has been received",
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Screening Request Received</title></head>
<body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1E293B;border-radius:12px;overflow:hidden;border:1px solid #334155;">
        <tr><td style="background:#1E40AF;padding:18px 24px;">
          <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#BFDBFE;">Catalyze Partners · IST Screener</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;">Screening Request Received</p>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 16px;font-size:14px;color:#CBD5E1;">Thank you for sending your deal to <strong>screen@catalyze.partners</strong>.</p>
          <p style="margin:0 0 16px;font-size:14px;color:#CBD5E1;">Your email address is not yet registered in our screening platform. A member of the Catalyze Partners team has been notified and will follow up with you shortly.</p>
          <p style="margin:0;font-size:13px;color:#94A3B8;">If you believe you should have access, please contact your Catalyze Partners point of contact.</p>
        </td></tr>
        <tr><td style="background:#0F172A;padding:14px 24px;border-top:1px solid #1E293B;">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center;">Catalyze Partners IST Screener</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });
    } catch (err) {
      console.error("[email-intake] Failed to send unregistered-sender reply:", err);
    }

    return NextResponse.json({ received: true, queued: true }, { status: 200 });
  }

  // ─── 7b. Registered sender ──────────────────────────────────────────────────
  // Insert a placeholder queue row so we can track progress (and for audit trail)
  const { data: queueRow, error: queueInsertError } = await serviceClient
    .from("email_intake_queue")
    .insert({
      sender_email: senderEmail,
      sender_name: senderName,
      subject: data.subject ?? null,
      raw_text: extractedText,
      status: "pending",
      email_date: data.date ?? null,
      resend_email_id: data.email_id ?? null,
    })
    .select("id")
    .single();

  if (queueInsertError) {
    console.error("[email-intake] Failed to record intake row:", queueInsertError.message);
    // Non-fatal — continue processing
  }

  try {
    // 8. Run IST analysis
    const { analysis } = await analyzeDocument(extractedText);

    // 9. Score the analysis
    const scoringResult = scoreAnalysis(analysis, { weights: DEFAULT_WEIGHTS });

    // 10. Save the screening under the sender's user account
    const { data: screening, error: screeningError } = await serviceClient
      .from("screenings")
      .insert({
        user_id: user.id,
        company_name: analysis.companyName,
        deal_type: analysis.dealType,
        deal_source: "email_intake",
        composite_score: scoringResult.compositeScore,
        recommendation: scoringResult.recommendation,
        raw_document_text: extractedText,
        ai_response_json: analysis,
        scores_json: scoringResult,
        notes: data.subject ? `Received via email: ${data.subject}` : "Received via email",
        is_disqualified: scoringResult.isDisqualified,
        disqualifier_ids: [],
      })
      .select("id")
      .single();

    if (screeningError || !screening) {
      throw new Error(`Failed to save screening: ${screeningError?.message ?? "unknown error"}`);
    }

    const screeningId = screening.id as string;

    // 11. Mark the queue row as processed
    if (queueRow) {
      await serviceClient
        .from("email_intake_queue")
        .update({ status: "processed", screening_id: screeningId, processed_at: new Date().toISOString() })
        .eq("id", queueRow.id);
    }

    // 12. Send the results email back to the sender
    const emailHtml = buildIntakeResultEmail({
      analysis,
      scoringResult,
      screeningId,
      senderName: user.name ?? senderName ?? null,
      appUrl,
    });

    const { recommendation, compositeScore } = scoringResult;
    const recLabel =
      recommendation === "PROCEED"
        ? "PROCEED"
        : recommendation === "FURTHER_REVIEW"
          ? "FURTHER REVIEW"
          : "PASS";

    await resend.emails.send({
      from: fromAddress,
      to: [senderEmail],
      subject: `IST Screening Complete: ${analysis.companyName} — ${recLabel} (${compositeScore.toFixed(1)}/10)`,
      html: emailHtml,
    });

    return NextResponse.json({ received: true, screeningId }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[email-intake] Processing failed:", message);

    // Mark queue row as failed (reuse 'pending' status — admin can retry)
    if (queueRow) {
      await serviceClient
        .from("email_intake_queue")
        .update({ status: "pending" })
        .eq("id", queueRow.id);
    }

    // Send a failure notification to the sender
    try {
      await resend.emails.send({
        from: fromAddress,
        to: [senderEmail],
        subject: "Your screening request could not be processed",
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Screening Failed</title></head>
<body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1E293B;border-radius:12px;overflow:hidden;border:1px solid #334155;">
        <tr><td style="background:#7F1D1D;padding:18px 24px;">
          <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#FECACA;">Catalyze Partners · IST Screener</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#FFFFFF;">Screening Could Not Be Completed</p>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 16px;font-size:14px;color:#CBD5E1;">We received your email but were unable to complete the screening. This may happen if the attached document could not be read or if a temporary error occurred.</p>
          <p style="margin:0 0 16px;font-size:14px;color:#CBD5E1;">Please try again by forwarding the email to <strong>screen@catalyze.partners</strong>. If the issue persists, you can also upload the document directly at <a href="${appUrl}/upload" style="color:#6366F1;">${appUrl}/upload</a>.</p>
        </td></tr>
        <tr><td style="background:#0F172A;padding:14px 24px;border-top:1px solid #1E293B;">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center;">Catalyze Partners IST Screener</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });
    } catch (mailErr) {
      console.error("[email-intake] Failed to send failure notification:", mailErr);
    }

    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
