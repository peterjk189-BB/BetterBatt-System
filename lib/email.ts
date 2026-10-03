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

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
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
