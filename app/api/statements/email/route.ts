import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { loadStatement } from "@/lib/statementServer";
import { sendEmail, brandedEmailHtml } from "@/lib/email";
import { fmtDate, money } from "@/lib/invoices";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const date = typeof body.date === "string" && body.date ? body.date : new Date().toISOString().slice(0, 10);
  const out = await loadStatement(ctx.supabase, String(body.customer_id || ""), date);
  if (!out) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const to = (typeof body.to === "string" && body.to.trim()) || out.email;
  if (!/^\S+@\S+\.\S+$/.test(to)) return NextResponse.json({ error: "No valid email address (add an accounts contact email on the customer)" }, { status: 400 });

  const a = out.ageing;
  const overdue = a.d1_30 + a.d31_60 + a.d61;
  const res = await sendEmail({
    kind: "invoices",
    to,
    subject: `Statement from Better Batt Insulation – ${fmtDate(date)}`,
    html: brandedEmailHtml({
      heading: "Account statement",
      bodyHtml: `<p>Hi ${esc(out.customer.accounts_contact_name || out.customer.name || "there")},</p><p>Please find your account statement attached, as at ${fmtDate(date)}.</p><p><b>Total owing:</b> ${money(a.total)} (inc GST)${overdue > 0.005 ? `<br/><b>Of which overdue:</b> ${money(overdue)}` : ""}</p><p>Please quote the invoice number with your payment. If you've already paid, thank you – please disregard.</p>`,
    }),
    attachments: [{ filename: `Statement-${date}.pdf`, content: Buffer.from(out.bytes).toString("base64") }],
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

  // Log it; ignore if migration 0055 hasn't been run.
  await ctx.supabase.from("customer_statements").insert({ customer_id: out.customer.id, statement_date: date, total_owing: a.total, sent_to: to, sent_by: ctx.user.id });
  return NextResponse.json({ ok: true, to });
}
