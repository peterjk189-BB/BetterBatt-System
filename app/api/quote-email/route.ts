import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { sendEmail, siteUrl } from "@/lib/email";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.project_id === "string" ? body.project_id : undefined;
  const toEmail = typeof body.to_email === "string" ? body.to_email.trim() : "";

  if (!projectId) {
    return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
  }
  if (!toEmail) {
    return NextResponse.json({ error: "Please enter the customer's email address" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, quote_number, share_token, customers(name)")
    .eq("id", projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const link = `${siteUrl()}/quote/${project.share_token}`;
  const customerName = (project.customers as any)?.name || "";

  const result = await sendEmail({
    to: toEmail,
    subject: `Your quote from Better Batt Insulation (Q${project.quote_number})`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 4px;">Quote Q${project.quote_number}</h2>
        <p style="color: #555;">
          Hi ${customerName || "there"},<br/><br/>
          Here's your quote from Better Batt Insulation. Click below to view it and accept online.
        </p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
            View &amp; accept quote
          </a>
        </p>
        <p style="color: #999; font-size: 12px;">Or copy this link: ${link}</p>
      </div>
    `,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await logAudit(supabase, {
    eventType: "update",
    entityType: "quote",
    entityId: project.id,
    entityLabel: `Q${project.quote_number}`,
    details: `Emailed quote link to ${toEmail}`,
  });

  return NextResponse.json({ ok: true });
}
