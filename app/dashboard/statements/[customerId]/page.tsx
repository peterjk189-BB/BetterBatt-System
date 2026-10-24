import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ageingOf, BUCKET_LABELS, statementRows, type StatementInvoice, type StatementPayment } from "@/lib/statements";
import { fmtDate, invNo, money } from "@/lib/invoices";
import StatementActions from "./StatementActions";

export default async function StatementPage({ params, searchParams }: { params: Promise<{ customerId: string }>; searchParams: Promise<{ date?: string }> }) {
  const { customerId } = await params;
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("*").eq("id", customerId).single();
  if (!c) notFound();
  const { data: invs } = await supabase.from("invoices").select("id, invoice_number, customer_id, description, customer_po, total, status, invoice_date, due_date").eq("customer_id", customerId).neq("status", "Void");
  const ids = (invs ?? []).map((i: any) => i.id);
  const { data: pays } = ids.length ? await supabase.from("invoice_payments").select("invoice_id, paid_on, amount").in("invoice_id", ids) : { data: [] as any[] };
  const rows = statementRows((invs ?? []) as StatementInvoice[], (pays ?? []) as StatementPayment[], date);
  const a = ageingOf(rows);
  const email = c.accounts_contact_email || c.contact_email || "";
  const keys = ["current", "d1_30", "d31_60", "d61"] as const;
  return (
    <div className="max-w-4xl">
      <Link href={`/dashboard/statements?date=${date}`} className="text-sm text-accent">← Statements</Link>
      <h1 className="mt-2 text-2xl font-bold">{c.name}</h1>
      <p className="text-sm text-[var(--muted)]">Statement as at {fmtDate(date)}{c.payment_terms ? ` · ${c.payment_terms}` : ""}</p>
      <StatementActions customerId={customerId} date={date} defaultEmail={email} />
      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-xs uppercase text-[var(--muted)]">Total owing (inc GST)</p>
        <p className="text-3xl font-bold tabular-nums">{money(a.total)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
          {keys.map((k) => (<div key={k}><p className="text-xs text-[var(--muted)]">{BUCKET_LABELS[k]}</p><p className="tabular-nums">{money(a[k])}</p></div>))}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--muted)]"><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Details</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--muted)]">No outstanding invoices.</td></tr>}
            {rows.map((r) => (
              <tr key={r.invoice.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-3 py-2"><Link href={`/dashboard/invoices/${r.invoice.id}`} className="text-accent">{invNo(r.invoice.invoice_number)}</Link></td>
                <td className="px-3 py-2">{fmtDate(r.invoice.invoice_date)}</td>
                <td className={`px-3 py-2 ${r.daysOverdue > 0 ? "text-[#b91c1c]" : ""}`}>{fmtDate(r.due)}{r.daysOverdue > 0 ? ` (${r.daysOverdue}d)` : ""}</td>
                <td className="px-3 py-2">{r.invoice.customer_po || r.invoice.description || ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.invoice.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.paid > 0 ? money(r.paid) : "—"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
