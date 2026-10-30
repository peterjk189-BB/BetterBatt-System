// Minimal Resend wrapper using plain fetch — no SDK dependency to install.
// Docs: https://resend.com/docs/api-reference/emails/send-email
//
// Needs RESEND_API_KEY set (Vercel Project Settings -> Environment Variables).
// Until a sending domain is verified in Resend, test-mode accounts can only
// send from "onboarding@resend.dev" and only to the email address the
// Resend account was created with — any other "to" address gets rejected by
// Resend's API with a clear error message, which callers should surface
// rather than swallow.

export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000"
  );
}

/**
 * Wraps body content in Better Batt Insulation's branded email shell —
 * logo, dark header bar, accent button — instead of a bare paragraph of
 * text, so account emails (and anything else transactional) read as from
 * the business rather than a generic, unbranded notice.
 */
export function brandedEmailHtml({
  previewText,
  heading,
  bodyHtml,
  buttonText,
  buttonUrl,
  rows,
}: {
  previewText?: string;
  heading: string;
  bodyHtml: string;
  buttonText?: string;
  buttonUrl?: string;
  /** Optional label / value summary shown in a panel under the message (quote number, site, etc.). */
  rows?: { label: string; value: string }[];
}) {
  const logoUrl = `${siteUrl()}/logo.png`;
  const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const summary =
    rows && rows.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;background:#f7f6f3;border:1px solid #e6e4df;border-radius:8px;">
          ${rows
            .map(
              (r) => `<tr>
                <td style="padding:10px 16px;font-family:${font};font-size:13px;color:#8a8a8a;width:38%;border-bottom:1px solid #e6e4df;">${r.label}</td>
                <td style="padding:10px 16px;font-family:${font};font-size:14px;color:#111418;font-weight:600;border-bottom:1px solid #e6e4df;">${r.value}</td>
              </tr>`
            )
            .join("")}
        </table>`
      : "";
  const button = buttonUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 14px;">
        <tr>
          <td align="center" bgcolor="#2563eb" style="border-radius:8px;">
            <a href="${buttonUrl}" style="display:inline-block;padding:14px 32px;font-family:${font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${buttonText || "Continue"}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-family:${font};font-size:12px;line-height:1.5;color:#9a9a9a;word-break:break-all;">
        Button not working? Paste this link into your browser:<br /><a href="${buttonUrl}" style="color:#6b7280;">${buttonUrl}</a>
      </p>`
    : "";
  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText || ""}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f3f0" style="background:#f4f3f0;">
      <tr><td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e6e4df;border-radius:12px;">
          <tr><td bgcolor="#111418" style="background:#111418;padding:24px 36px;border-radius:12px 12px 0 0;">
            <img src="${logoUrl}" alt="Better Batt Insulation" height="36" style="height:36px;display:block;border:0;" />
          </td></tr>
          <tr><td style="padding:36px 36px 32px;font-family:${font};">
            <h1 style="margin:0 0 16px;font-family:${font};font-size:22px;line-height:1.3;color:#111418;">${heading}</h1>
            <div style="font-family:${font};font-size:15px;line-height:1.65;color:#444444;">${bodyHtml}</div>
            ${summary}
            ${button}
            <p style="margin:30px 0 0;font-family:${font};font-size:15px;line-height:1.6;color:#444444;">
              Kind regards,<br /><strong style="color:#111418;">The team at Better Batt Insulation</strong>
            </p>
          </td></tr>
          <tr><td bgcolor="#f4f3f0" style="background:#f4f3f0;padding:18px 36px;border-top:1px solid #e6e4df;border-radius:0 0 12px 12px;font-family:${font};font-size:12px;line-height:1.6;color:#8a8a8a;">
            <strong style="color:#555555;">Better Batt Insulation</strong> &middot; Melbourne, Victoria<br />
            <a href="https://betterbattinsulation.com.au" style="color:#8a8a8a;">betterbattinsulation.com.au</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  `;
}

export type EmailKind = "invoices" | "quotes" | "jobs";

const KIND_DEFAULT_LOCAL: Record<EmailKind, string> = { invoices: "accounts", quotes: "quotes", jobs: "jobs" };

/**
 * The From address. Invoices, quotes and work order / job emails can each have their own address:
 * set RESEND_FROM_INVOICES / RESEND_FROM_QUOTES / RESEND_FROM_JOBS, or just set RESEND_FROM on your
 * verified domain and the system uses accounts@, quotes@ and jobs@ on that same domain automatically.
 */
export function fromAddress(kind?: EmailKind): string {
  const base = process.env.RESEND_FROM || "Better Batt Insulation <onboarding@resend.dev>";
  if (!kind) return base;
  const specific = process.env[`RESEND_FROM_${kind.toUpperCase()}`];
  if (specific) return specific;
  const m = base.match(/^(.*?)<?([^<>\s@]+)@([^<>\s]+?)>?\s*$/);
  if (!m || /(^|\.)resend\.dev$/i.test(m[3])) return base;
  const name = m[1].trim() || "Better Batt Insulation";
  return `${name} <${KIND_DEFAULT_LOCAL[kind]}@${m[3]}>`;
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
  kind,
}: {
  /** Which address to send from: invoices (accounts@), quotes (quotes@) or jobs (jobs@). */
  kind?: EmailKind;
  to: string | string[];
  subject: string;
  html: string;
  /** Base64-encoded file content. */
  attachments?: { filename: string; content: string }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email sending isn't set up yet (RESEND_API_KEY is missing)." };
  }
  const from = fromAddress(kind);
  // Mail goes out from the mail. subdomain, which has no mailbox, so replies go to a real address when set.
  const replyTo = process.env.RESEND_REPLY_TO;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(attachments?.length ? { attachments } : {}) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.message || `Resend returned ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Could not reach the email service" };
  }
}
