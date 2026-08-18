import sgMail from "@sendgrid/mail";

/**
 * SendGrid client wrapper (Requirements 4.1, 4.2, 10.1 / Task 6.1).
 *
 * Lazily initialized (API key not required at module-load time — same
 * pattern as the OpenAI client — so `next build` doesn't need
 * SENDGRID_API_KEY set). Every outbound email sent through this module
 * gets an unsubscribe link + physical mailing address footer appended
 * automatically, so no call site can accidentally send a
 * non-CAN-SPAM-compliant email (Requirement 10.1).
 */

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY is not configured");
  }
  sgMail.setApiKey(apiKey);
  initialized = true;
}

function fromAddress(): string {
  return process.env.SENDGRID_FROM_EMAIL ?? "hello@localpilot.ai";
}

// CAN-SPAM requires a valid physical postal address in every commercial
// email. Kept as a single constant so it's obvious where to update it
// once a real business address exists, rather than buried in template
// strings at each call site.
const MAILING_ADDRESS = process.env.COMPANY_MAILING_ADDRESS ?? "LocalPilot AI";

export type SendEmailParams = {
  to: string;
  subject: string;
  /** Plain-text body. HTML is generated from this with paragraph breaks preserved. */
  text: string;
  /** Unique per-recipient/per-thread token embedded in the unsubscribe link. */
  unsubscribeToken: string;
};

function appendComplianceFooter(text: string, unsubscribeToken: string): { text: string; html: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://localpilot.ai";
  const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  const footerText = [
    "",
    "---",
    MAILING_ADDRESS,
    `Don't want these emails? Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  const htmlBody = text
    .split("\n\n")
    .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  const footerHtml = [
    "<hr/>",
    `<p style="font-size:12px;color:#666;">${MAILING_ADDRESS}</p>`,
    `<p style="font-size:12px;color:#666;">Don't want these emails? <a href="${unsubscribeUrl}">Unsubscribe</a></p>`,
  ].join("\n");

  return {
    text: text + footerText,
    html: htmlBody + footerHtml,
  };
}

/**
 * Sends a single outbound email with the CAN-SPAM footer appended
 * automatically (Requirement 10.1). Used for both outreach sequence
 * emails and AI auto-reply emails (Task 6.6) — every outbound email in
 * this system goes through this one function.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  ensureInitialized();

  const { text, html } = appendComplianceFooter(params.text, params.unsubscribeToken);

  await sgMail.send({
    to: params.to,
    from: fromAddress(),
    subject: params.subject,
    text,
    html,
    trackingSettings: {
      openTracking: { enable: true },
      clickTracking: { enable: true },
    },
  });
}
