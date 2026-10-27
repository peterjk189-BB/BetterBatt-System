import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, brandedEmailHtml, siteUrl } from "@/lib/email";

// Public: "Forgot password?" on the sign-in page. Emails a reset link when the address has an account.
// Always answers { ok: true } so it can't be used to find out which emails have accounts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });

  try {
    const admin = createAdminClient();
    const redirectTo = `${siteUrl()}/set-password`;
    if (process.env.RESEND_API_KEY) {
      const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
      if (!error && linkData?.properties?.action_link) {
        await sendEmail({
          to: email,
          subject: "Reset your Better Batt System password",
          html: brandedEmailHtml({
            previewText: "Use this link to choose a new password.",
            heading: "Reset your password",
            bodyHtml: `<p>We got a request to reset the password for your Better Batt System account.</p><p>Click below to choose a new password. If you didn't ask for this, you can ignore this email and your password won't change.</p>`,
            buttonText: "Choose a new password",
            buttonUrl: linkData.properties.action_link,
          }),
        });
      }
    } else {
      await admin.auth.resetPasswordForEmail(email, { redirectTo });
    }
  } catch {
    /* never reveal anything about the account */
  }
  return NextResponse.json({ ok: true });
}
