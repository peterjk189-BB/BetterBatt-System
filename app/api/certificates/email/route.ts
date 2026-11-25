import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { getEmailSender } from "@/lib/emailSender";
import { sendEmail, brandedEmailHtml, cleanEmailList } from "@/lib/email";
import { certificateNumber } from "@/lib/certificate";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Emails an insulation certificate (PDF made in the browser) to the address(es) the office chose,
// marks it sent, and optionally saves a new address to the customer.
export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  const { data: ins } = await ctx.supabase
    .from("inspections")
    .select("id, inspection_number, site_address, suburb, builder_name, customer_id, project_id, work_order_id")
    .eq("id", String(body.inspection_id || ""))
    .single();
  if (!ins) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

  const { good: to, bad } = cleanEmailList(String(body.to || ""));
  if (bad.length) return NextResponse.json({ error: `Not an email address: ${bad.join(", ")}` }, { status: 400 });
  if (!to.length) return NextResponse.json({ error: "Enter an email address" }, { status: 400 });

  const pdf = String(body.pdf || "");
  if (!pdf || pdf.length > 15_000_000) return NextResponse.json({ error: "The certificate PDF is missing or too large" }, { status: 400 });

  const certNo = certificateNumber(ins.inspection_number);
  const address = [ins.site_address, ins.suburb].filter(Boolean).join(", ");
  const filename = (String(body.filename || "").replace(/[\\/:*?"<>|\r\n\t]+/g, " ").trim() || `Insulation Certificate ${certNo}.pdf`).slice(0, 150);
  const note = String(body.note || "").trim().slice(0, 2000);

  // The customer, for the greeting and for saving a new address.
  let customerId: string | null = (ins as any).customer_id ?? null;
  if (!customerId && ins.project_id) {
    const { data: p } = await ctx.supabase.from("projects").select("customer_id").eq("id", ins.project_id).single();
    customerId = (p as any)?.customer_id ?? null;
  }
  if (!customerId && ins.work_order_id) {
    const { data: w } = await ctx.supabase.from("work_orders").select("projects(customer_id)").eq("id", ins.work_order_id).single();
    customerId = (w as any)?.projects?.customer_id ?? null;
  }
  const { data: customer } = customerId
    ? await ctx.supabase.from("customers").select("id, name, contact_name").eq("id", customerId).single()
    : { data: null };
  const greet = (customer as any)?.contact_name || (customer as any)?.name || ins.builder_name || "there";

  const res = await sendEmail({
    kind: "jobs",
    sender: await getEmailSender(ctx.supabase, ctx.user),
    to,
    subject: `Insulation certificate ${certNo}${address ? ` – ${address}` : ""}`,
    html: brandedEmailHtml({
      heading: "Certificate of insulation installation",
      bodyHtml: `<p>Hi ${esc(greet)},</p>${note ? `<p>${esc(note).replace(/\n/g, "<br/>")}</p>` : ""}<p>Please find attached the certificate of insulation installation${address ? ` for <b>${esc(address)}</b>` : ""} (${certNo}).</p><p>Please keep it with your building records. Let us know if you need anything else.</p>`,
    }),
    attachments: [{ filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`, content: pdf }],
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

  const sentAt = new Date().toISOString();
  await ctx.supabase.from("inspections").update({ certificate_sent_at: sentAt }).eq("id", ins.id);

  // Save a new address to the customer when asked (one address only).
  let saved = false;
  if (body.save_to_customer && customerId && to.length === 1) {
    const { error } = await ctx.supabase.from("customers").update({ contact_email: to[0] }).eq("id", customerId);
    saved = !error;
  }

  await logAudit(ctx.supabase, {
    eventType: "update",
    entityType: "Inspection",
    entityId: ins.id,
    entityLabel: certNo,
    details: `Certificate emailed to ${to.join(", ")}${saved ? " (saved to customer)" : ""}`,
  });
  return NextResponse.json({ ok: true, to: to.join(", "), sent_at: sentAt, saved });
}
