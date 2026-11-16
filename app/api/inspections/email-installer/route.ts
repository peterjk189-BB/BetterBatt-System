import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailHtml, cleanEmailAddress, sendEmail, siteUrl } from "@/lib/email";
import { getEmailSender } from "@/lib/emailSender";

export const runtime = "nodejs";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Office/admin emails an inspection report to an installer with their own notes. The installer opens the report from the button. */
export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.inspection_id === "string" ? body.inspection_id : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
  const to = cleanEmailAddress(typeof body.to === "string" ? body.to : "");
  if (!id) return NextResponse.json({ error: "Missing inspection" }, { status: 400 });
  if (!to) return NextResponse.json({ error: "Enter a valid installer email address" }, { status: 400 });

  const admin = createAdminClient();
  const { data: ins } = await admin
    .from("inspections")
    .select("id, inspection_number, inspection_date, result, site_address, suburb, builder_name, installer_name, work_orders(wo_number)")
    .eq("id", id)
    .single();
  if (!ins) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

  const wo: any = Array.isArray((ins as any).work_orders) ? (ins as any).work_orders[0] : (ins as any).work_orders;
  const label = `INS${ins.inspection_number}`;
  const site = [ins.site_address, ins.suburb].filter(Boolean).join(", ");
  const first = (typeof body.installer_name === "string" ? body.installer_name : ins.installer_name || "").split(" ")[0] || "there";
  const resultText = ins.result === "PASS" ? "PASS" : ins.result === "FAIL" ? "FAIL: work needs attention" : "No result recorded";
  const rows: { label: string; value: string }[] = [
    { label: "Inspection", value: esc(label) },
    { label: "Result", value: esc(resultText) },
    { label: "Site", value: esc(site || "—") },
  ];
  if (wo?.wo_number) rows.push({ label: "Work order", value: esc(String(wo.wo_number)) });
  if (ins.builder_name) rows.push({ label: "Builder", value: esc(ins.builder_name) });

  const notesHtml = notes
    ? `<div style="margin:16px 0 0;padding:12px 14px;background:#fff8e6;border-left:4px solid #fdb930;border-radius:4px;"><div style="font-size:12px;color:#8a8a8a;margin-bottom:4px;">NOTES FROM BETTER BATT</div>${esc(notes).replace(/\n/g, "<br>")}</div>`
    : "";

  const sender = await getEmailSender(ctx.supabase, ctx.user);
  const r = await sendEmail({
    kind: "jobs",
    to,
    sender,
    subject: `Inspection report ${label}${site ? " — " + site : ""}`,
    html: brandedEmailHtml({
      previewText: `${label} · ${resultText}${site ? " · " + site : ""}`,
      heading: `Hi ${esc(first)}, here is the inspection report`,
      bodyHtml: `<p style="margin:0 0 12px;">Please open the report below${ins.result === "FAIL" ? " and fix the items marked" : ""}.</p>${notesHtml}`,
      rows,
      buttonText: "Open inspection report",
      buttonUrl: `${siteUrl()}/dashboard/inspections/${ins.id}/print`,
    }),
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
