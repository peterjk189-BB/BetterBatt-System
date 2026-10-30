import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { sendEmail, siteUrl, brandedEmailHtml } from "@/lib/email";

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
      kind: "quotes",
    to: toEmail,
    subject: `Your quote from Better Batt Insulation (Q${project.quote_number})`,
    html: brandedEmailHtml({
      previewText: `Your quote Q${project.quote_number} from Better Batt Insulation is ready to view and accept online.`,
      heading: `Your quote is ready`,
      bodyHtml: `<p style="margin:0 0 14px;">Hi ${customerName || "there"},</p>
        <p style="margin:0;">Thank you for the opportunity to quote. Your quote from Better Batt Insulation is ready. Use the button below to review the details and accept it online. If you have any questions, just reply to this email.</p>`,
      rows: [{ label: "Quote number", value: `Q${project.quote_number}` }],
      buttonText: "View & accept quote",
      buttonUrl: link,
    }),
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
