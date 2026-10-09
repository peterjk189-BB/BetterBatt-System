import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { invNo } from "@/lib/invoices";

export const runtime = "nodejs";

// QuickBooks Desktop invoice import file (File > Utilities > Import > IIF Files).
const clean = (s: string | null | undefined) => (s || "").replace(/[\t\r\n]+/g, " ").trim();
const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const amt = (n: number) => n.toFixed(2);

export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "No invoices selected" }, { status: 400 });

  const { supabase } = ctx;
  const [{ data: invoices }, { data: settings }] = await Promise.all([
    supabase.from("invoices").select("*, customers(name), projects(quote_number, lot_no, address, suburb)").in("id", ids).order("invoice_number"),
    supabase.from("company_settings").select("qb_ar_account, qb_income_account, qb_gst_account").eq("id", true).maybeSingle(),
  ]);
  const ar = clean(settings?.qb_ar_account) || "Accounts Receivable";
  const income = clean(settings?.qb_income_account) || "Sales";
  const gstAcc = clean(settings?.qb_gst_account) || "GST Collected";

  const list = (invoices ?? []).filter((i: any) => i.status !== "Void" && i.status !== "Draft");
  if (list.length === 0) {
    return NextResponse.json({ error: "Only sent invoices can be exported. Mark them as Sent first." }, { status: 400 });
  }

  const T = "\t";
  const out: string[] = [];
  out.push(["!CUST", "NAME"].join(T));
  const names = Array.from(new Set(list.map((i: any) => clean(i.customers?.name) || "Unknown customer")));
  for (const n of names) out.push(["CUST", n].join(T));
  out.push(["!TRNS", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "DUEDATE", "TERMS", "MEMO"].join(T));
  out.push(["!SPL", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO"].join(T));
  out.push("!ENDTRNS");
  for (const i of list as any[]) {
    const name = clean(i.customers?.name) || "Unknown customer";
    const memo = clean(i.description) || `${i.kind} invoice${i.projects?.quote_number ? ` - Q${i.projects.quote_number}` : ""}`;
    const doc = invNo(i.invoice_number);
    out.push(["TRNS", "INVOICE", dmy(i.invoice_date), ar, name, amt(Number(i.total)), doc, i.due_date ? dmy(i.due_date) : "", clean(i.terms), memo].join(T));
    out.push(["SPL", "INVOICE", dmy(i.invoice_date), income, name, amt(-Number(i.amount_ex_gst)), doc, memo].join(T));
    if (Number(i.gst) !== 0) out.push(["SPL", "INVOICE", dmy(i.invoice_date), gstAcc, name, amt(-Number(i.gst)), doc, "GST"].join(T));
    out.push("ENDTRNS");
  }

  await supabase
    .from("invoices")
    .update({ qb_exported_at: new Date().toISOString() })
    .in("id", list.map((i: any) => i.id));

  return new NextResponse(out.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="BetterBatt-invoices-${new Date().toISOString().slice(0, 10)}.iif"`,
    },
  });
}
