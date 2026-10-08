import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, siteUrl, brandedEmailHtml } from "@/lib/email";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Admin only: create an onboarding link (optionally emailing it), or re-send one.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  let invite: any;
  if (typeof body.invite_id === "string") {
    const { data, error } = await supabase.from("subcontractor_invites").select("*").eq("id", body.invite_id).single();
    if (error || !data) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    if (data.status !== "Sent") return NextResponse.json({ error: "This invite has already been used or cancelled" }, { status: 400 });
    // Re-sending also gives it a fresh 14 days.
    const { data: renewed } = await supabase
      .from("subcontractor_invites")
      .update({ expires_at: new Date(Date.now() + 14 * 86400000).toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    invite = renewed || data;
  } else {
    const { data, error } = await supabase
      .from("subcontractor_invites")
      .insert({
        invitee_name: str(body.name) || null,
        invitee_email: str(body.email) || null,
        invitee_phone: str(body.phone) || null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: (error?.message || "Could not create invite") + " (has migration 0030 been run in Supabase?)" },
        { status: 400 }
      );
    }
    invite = data;
  }

  const link = `${siteUrl()}/onboard/${invite.token}`;
  let emailed: "sent" | "skipped" | string = "skipped";
  if (body.send_email && invite.invitee_email) {
    const first = (invite.invitee_name || "").split(" ")[0];
    const res = await sendEmail({
      to: invite.invitee_email,
      subject: "Better Batt Insulation - subcontractor onboarding",
      html: brandedEmailHtml({
        previewText: "Please fill in your details and sign our working agreement.",
        heading: "Welcome to Better Batt Insulation",
        bodyHtml: `<p>Hi ${esc(first || "there")},</p><p>Please use the button below to fill in your business details, upload your photo ID, White Card and insurance certificate, and read and sign our working agreement. It takes about 10 minutes on your phone. Have your ABN and bank details handy.</p><p>This link is just for you and expires in 14 days.</p>`,
        buttonText: "Start onboarding",
        buttonUrl: link,
      }),
    });
    emailed = res.ok ? "sent" : res.error;
  }

  return NextResponse.json({ ok: true, invite, link, emailed });
}
