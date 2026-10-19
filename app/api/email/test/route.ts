import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { brandedEmailHtml, sendEmail } from "@/lib/email";

// Admin-only. Reports whether email is configured (never returns the key) and,
// on POST, sends a test email so Peter can confirm Resend is working.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? user : null;
}

function status() {
  const from = process.env.RESEND_FROM || "Better Batt Insulation <onboarding@resend.dev>";
  return {
    keySet: !!process.env.RESEND_API_KEY,
    from,
    usingTestSender: from.includes("onboarding@resend.dev"),
  };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  return NextResponse.json(status());
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const to = String(body.to || user.email || "").trim();
  if (!to) return NextResponse.json({ error: "Enter an email address" }, { status: 400 });
  const result = await sendEmail({
    to,
    subject: "Better Batt test email",
    html: brandedEmailHtml({
      previewText: "Email sending is working",
      heading: "Email is working",
      bodyHtml: "<p>This is a test from the Better Batt system. If you can read this, Resend is set up correctly.</p>",
    }),
  });
  if (!result.ok) return NextResponse.json({ ...status(), ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ...status(), ok: true });
}
