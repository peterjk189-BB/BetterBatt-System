import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { loadPoPdf } from "@/lib/poServer";
import { poTotals } from "@/lib/poPdf";
import { sendEmail, brandedEmailHtml } from "@/lib/email";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const splitEmails = (v: unknown) =>
  (typeof v === "string" ? v : "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Default recipients for this purchase order's supplier. */
export async function GET(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const out = await loadPoPdf(ctx.supabase, new URL(req.url).searchParams.get("id") || "");
  if (!out) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  return NextResponse.json({ to: out.to, supplier: out.supplierName });
}

export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const to = splitEmails(body.to);
  if (to.length === 0 || !to.every((e) => EMAIL_RE.test(e))) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }
  const out = await loadPoPdf(ctx.supabase, String(body.id || ""));
  if (!out) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  const { po } = out;
  const no = po.po_number || "";

  const { data: lines } = await ctx.supabase
    .from("purchase_order_lines")
    .select("qty_pks, unit_cost")
    .eq("purchase_order_id", po.id);
  const t = poTotals({ po, supplier: null, lines: (lines ?? []).map((l: any) => ({ ...l, parts: null })) });
  const when = po.delivery_date ? new Date(po.delivery_date + "T00:00:00Z").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
  const note = typeof body.message === "string" ? body.message.trim() : "";

  const res = await sendEmail({
    kind: "jobs",
    to,
    subject: `Purchase Order ${no} from Better Batt Insulation`,
    html: brandedEmailHtml({
      heading: `Purchase Order ${esc(no)}`,
      bodyHtml: `<p>Hi ${esc(out.supplierName || "there")},</p><p>Please find our purchase order attached.</p>${note ? `<p>${esc(note).replace(/\n/g, "<br/>")}</p>` : ""}<p><b>PO number:</b> ${esc(no)}<br/>${when ? `<b>Delivery:</b> ${esc(when)}<br/>` : ""}${po.delivery_address ? `<b>Deliver to:</b> ${esc(po.delivery_address)}<br/>` : ""}<b>Total:</b> ${t.total.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} (inc GST)</p><p>Please quote ${esc(no)} on your delivery docket and invoice. Thanks!</p>`,
    }),
    attachments: [{ filename: `Purchase Order ${no}.pdf`, content: Buffer.from(out.bytes).toString("base64") }],
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
