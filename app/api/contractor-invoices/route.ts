import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveSubcontractorId } from "@/lib/currentUser";
import { buildInvoiceDraft, invoiceNumber } from "@/lib/contractorInvoice";
import { recordAlert } from "@/lib/alerts";
import { notifyStaff } from "@/lib/notifyStaff";
import { siteUrl } from "@/lib/email";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A contractor submits a tax invoice for a work order. Everything (amounts, SWMS, inspection) is worked out here from
// the database, never trusted from the browser.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const woId = typeof body.work_order_id === "string" ? body.work_order_id : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!woId) return NextResponse.json({ error: "Missing work_order_id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const subId = await getEffectiveSubcontractorId();
  if (!subId) return NextResponse.json({ error: "Your account isn't linked to a contractor yet. Ask the office." }, { status: 403 });
  const { data: visible } = await supabase.from("work_orders").select("id").eq("id", woId).single();
  if (!visible) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: sub } = await admin.from("subcontractors").select("invoicing_enabled").eq("id", subId).single();
  if (!sub) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
  if (!(sub as any).invoicing_enabled) return NextResponse.json({ error: "Tax invoicing isn't switched on for your account. Ask the office." }, { status: 403 });

  const built = await buildInvoiceDraft(admin, woId, subId);
  if (!built.draft) return NextResponse.json({ error: built.error || "Could not build the invoice" }, { status: 400 });
  const d = built.draft;
  if (!d.swms_ok) return NextResponse.json({ error: "The SWMS for this job isn't signed off yet." }, { status: 400 });
  if (!d.inspection_ok) return NextResponse.json({ error: "The inspection hasn't passed yet." }, { status: 400 });
  if (built.alreadyBilled) return NextResponse.json({ error: "Everything on this work order is already invoiced." }, { status: 400 });
  if (d.lines.length === 0) return NextResponse.json({ error: "There is nothing to invoice on this work order yet." }, { status: 400 });
  if (!d.contractor_abn) return NextResponse.json({ error: "Your ABN isn't on file. Ask the office to add it before invoicing." }, { status: 400 });

  // Next number for this contractor (retry once if two are submitted at the same moment).
  let inserted: any = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 2 && !inserted; attempt++) {
    const { data: top } = await admin.from("contractor_invoices").select("seq").eq("subcontractor_id", subId).order("seq", { ascending: false }).limit(1);
    const seq = ((top?.[0] as any)?.seq ?? 0) + 1;
    const { data, error } = await admin
      .from("contractor_invoices")
      .insert({
        subcontractor_id: subId,
        work_order_id: woId,
        seq,
        invoice_number: invoiceNumber(d.contractor_name, seq),
        contractor_name: d.contractor_name,
        contractor_abn: d.contractor_abn,
        gst_registered: d.gst_registered,
        bank_account_name: d.bank_account_name,
        bank_bsb: d.bank_bsb,
        bank_account_number: d.bank_account_number,
        site: d.site,
        wo_number: d.wo_number,
        completed_date: d.completed_date,
        lines: d.lines,
        line_ids: d.line_ids,
        unapproved_extras: d.unapproved_extras,
        subtotal_ex: d.subtotal_ex,
        gst: d.gst,
        total: d.total,
        note: note || null,
        swms_ok: d.swms_ok,
        inspection_ok: d.inspection_ok,
        created_by: user.id,
      })
      .select("id, invoice_number")
      .single();
    if (error) lastErr = error.message;
    else inserted = data;
  }
  if (!inserted) {
    const missing = /contractor_invoices|relation|schema cache/i.test(lastErr);
    return NextResponse.json({ error: missing ? "Contractor invoicing isn't set up yet (migration 0079 hasn't been run)." : lastErr }, { status: 400 });
  }

  const money = d.total.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  await recordAlert(admin, {
    kind: "contractor_invoice",
    title: `Tax invoice ${inserted.invoice_number} from ${d.contractor_name}`,
    body: `WO${d.wo_number}${d.site ? " · " + d.site : ""} · ${money}${d.unapproved_extras.length ? " · has unapproved extras" : ""}`,
    path: "/dashboard/contractor-payments/invoices",
    dedupeKey: `contractor-invoice:${inserted.id}`,
    actor: user.id,
  });
  await notifyStaff(admin, {
    subject: `Tax invoice ${inserted.invoice_number} from ${d.contractor_name} (WO${d.wo_number})`,
    heading: "A contractor tax invoice is waiting",
    previewText: `${d.contractor_name} submitted ${inserted.invoice_number} for ${money}`,
    bodyHtml: `<p style="margin:0 0 8px;">${esc(d.contractor_name)} submitted tax invoice <strong>${inserted.invoice_number}</strong> for work order WO${d.wo_number}.</p><p style="margin:0;">Total ${money}${d.gst_registered ? " inc GST" : ""}.${d.unapproved_extras.length ? " It also lists extras that still need your approval." : ""}</p>`,
    buttonText: "Review invoice",
    url: `${siteUrl()}/dashboard/contractor-payments/invoices`,
    path: "/dashboard/contractor-payments/invoices",
    pushTitle: "Contractor tax invoice",
    pushBody: `${d.contractor_name}: ${inserted.invoice_number} · ${money}`,
    tag: `contractor-invoice-${inserted.id}`,
  });

  return NextResponse.json({ ok: true, id: inserted.id, invoice_number: inserted.invoice_number });
}
