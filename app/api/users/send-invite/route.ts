import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail as sendBrandedEmail, brandedEmailHtml } from "@/lib/email";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return null;
  return user;
}

// Sends a "set your password" email to a user who already has an account
// (e.g. one created via "Create without emailing") — for when an admin
// decides to give them real access and wants them to pick their own
// password instead of sharing the temporary one.
export async function POST(req: Request) {
  const caller = await requireAdmin();
  if (!caller) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();
  const email = (body.email || "").trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000";

  const admin = createAdminClient();

  if (process.env.RESEND_API_KEY) {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteUrl}/set-password` },
    });
    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json({ error: linkError?.message || "Failed to generate invite link" }, { status: 400 });
    }
    const sent = await sendBrandedEmail({
      to: email,
      subject: "Set your password for Better Batt System",
      html: brandedEmailHtml({
        previewText: "Set your password to get started on Better Batt System.",
        heading: "Set your password",
        bodyHtml: `<p>You've been given access to the Better Batt System. Click below to set your password and sign in.</p>`,
        buttonText: "Set your password",
        buttonUrl: linkData.properties.action_link,
      }),
    });
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/set-password`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
