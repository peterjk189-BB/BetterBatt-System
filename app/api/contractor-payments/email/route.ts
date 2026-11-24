import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { getEmailSender } from "@/lib/emailSender";
import { sendEmail, brandedEmailHtml, cleanEmailList } from "@/lib/email";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const dmy = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function addDays(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const weekStart = String(body.weekStart || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return NextResponse.json({ error: "Missing week" }, { status: 400 });
  const pdf = typeof body.pdf === "string" ? body.pdf : "";
  if (!pdf) return NextResponse.json({ error: "Missing PDF" }, { status: 400 });
  const { good, bad } = cleanEmailList(String(body.to || ""));
  if (!good.length || bad.length) return NextResponse.json({ error: "No valid email address" }, { status: 400 });

  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(body.weekEnd || "")) ? String(body.weekEnd) : addDays(weekStart, 6);
  const exGst = Number(body.exGst) || 0;
  const n = Number(body.contractors) || 0;
  // A pay run sends its payment date instead of a week.
  const payDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.payDate || "")) ? String(body.payDate) : "";
  const period = payDate ? `pay run ${dmy(payDate)}` : `${dmy(weekStart)} to ${dmy(end)}`;
  const res = await sendEmail({
    kind: "invoices",
    sender: await getEmailSender(ctx.supabase, ctx.user),
    to: good,
    subject: payDate ? `Contractor payments – pay run ${dmy(payDate)}` : `Contractor payments – ${dmy(weekStart)} to ${dmy(end)}`,
    html: brandedEmailHtml({
      heading: "Contractor payments",
      bodyHtml: `<p>Hi,</p><p>Please find attached the contractor payments summary for ${period}.</p><p><b>${n}</b> contractor${n === 1 ? "" : "s"} · <b>${money(exGst)}</b> ex GST (GST is added at 10% for GST-registered contractors).</p>`,
    }),
    attachments: [{ filename: payDate ? `Contractor-Pay-Run-${payDate}.pdf` : `Contractor-Payments-${weekStart}-to-${end}.pdf`, content: pdf }],
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  try {
    await logAudit(ctx.supabase, { eventType: "update", entityType: "contractor_payments", entityId: weekStart, entityLabel: `Week ${weekStart}`, details: `${payDate ? `Contractor pay run ${payDate}` : "Weekly contractor payments"} emailed to ${good.join(", ")}` });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true, to: good.join(", ") });
}
