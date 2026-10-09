import { NextResponse } from "next/server";
import { requireStaff, loadInvoicePdf } from "@/lib/invoiceServer";
import { sendEmail, brandedEmailHtml } from "@/lib/email";
import { invNo, money, fmtDate } from "@/lib/invoices";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!/^\S+@\S+\.\S+$/.test(to)) return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });

  const out = await loadInvoicePdf(ctx.supabase, String(body.id || ""));
  if (!out) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const { inv } = out;

  const res = await sendEmail({
    to,
    subject: `Invoice ${invNo(inv.invoice_number)} from Better Batt Insulation`,
    html: brandedEmailHtml({
      heading: `Invoice ${invNo(inv.invoice_number)}`,
      bodyHtml: `<p>Hi ${esc(out.customerName || "there")},</p><p>Please find your invoice attached.</p><p><b>Amount due:</b> ${money(inv.total)} (inc GST)<br/><b>Due:</b> ${fmtDate(inv.due_date)}</p><p>Please quote ${invNo(inv.invoice_number)} with your payment. Thanks!</p>`,
    }),
    attachments: [{ filename: `${invNo(inv.invoice_number)}.pdf`, content: Buffer.from(out.bytes).toString("base64") }],
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

  await ctx.supabase
    .from("invoices")
    .update({ status: inv.status === "Draft" ? "Sent" : inv.status, sent_at: new Date().toISOString() })
    .eq("id", inv.id);
  return NextResponse.json({ ok: true });
}
