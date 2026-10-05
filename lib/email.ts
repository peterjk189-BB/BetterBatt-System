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
}: {
  previewText?: string;
  heading: string;
  bodyHtml: string;
  buttonText?: string;
  buttonUrl?: string;
}) {
  const logoUrl = `${siteUrl()}/logo.png`;
  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText || ""}</div>
    <div style="background:#f4f3f0;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e4df;">
        <div style="background:#111418;padding:22px 32px;">
          <img src="${logoUrl}" alt="Better Batt Insulation" style="height:34px;display:block;" />
        </div>
        <div style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111418;">${heading}</h1>
          <div style="font-size:15px;line-height:1.6;color:#444444;">${bodyHtml}</div>
          ${
            buttonUrl
              ? `<p style="margin:28px 0 10px;">
                  <a href="${buttonUrl}" style="background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
                    ${buttonText || "Continue"}
                  </a>
                </p>
                <p style="font-size:12px;color:#9a9a9a;word-break:break-all;">
                  Or paste this link into your browser:<br />${buttonUrl}
                </p>`
              : ""
          }
        </div>
        <div style="background:#f4f3f0;padding:16px 32px;font-size:12px;color:#8a8a8a;border-top:1px solid #e6e4df;">
          Better Batt Insulation &middot; betterbattinsulation.com.au
        </div>
      </div>
    </div>
  `;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Email sending isn't set up yet (RESEND_API_KEY is missing)." };
  }
  const from = process.env.RESEND_FROM || "Better Batt Insulation <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
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
