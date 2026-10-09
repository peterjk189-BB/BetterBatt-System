"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { derivedStatus, fmtDate, invNo, money, paidTotal, STATUS_STYLE, type DerivedStatus, type Invoice, type Payment } from "@/lib/invoices";
import { siteAddress } from "@/lib/siteAddress";

type Row = Invoice & {
  customers: { name: string } | null;
  projects: { quote_number: number; lot_no: string | null; address: string | null; suburb: string | null } | null;
};

const FILTERS = ["All", "Draft", "Unpaid", "Overdue", "Paid"] as const;

export default function InvoicesList({ invoices, payments, setupError }: { invoices: Row[]; payments: Payment[]; setupError: string | null }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Unpaid");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const paidBy = useMemo(() => {
    const m: Record<string, Payment[]> = {};
    for (const p of payments) (m[p.invoice_id] ||= []).push(p);
    return m;
  }, [payments]);

  const rows = useMemo(
    () =>
      invoices.map((i) => {
        const paid = paidTotal(paidBy[i.id] ?? []);
        return { inv: i, paid, status: derivedStatus(i, paid) as DerivedStatus };
      }),
    [invoices, paidBy]
  );

  const outstanding = rows.filter((r) => r.status === "Sent" || r.status === "Part paid" || r.status === "Overdue");
  const outstandingTotal = outstanding.reduce((s, r) => s + (r.inv.total - r.paid), 0);
  const overdue = rows.filter((r) => r.status === "Overdue");
  const overdueTotal = overdue.reduce((s, r) => s + (r.inv.total - r.paid), 0);
  const notExported = rows.filter((r) => (r.status !== "Draft" && r.status !== "Void") && !r.inv.qb_exported_at).length;

  const visible = rows.filter((r) => {
    if (filter === "Draft" && r.status !== "Draft") return false;
    if (filter === "Unpaid" && !["Sent", "Part paid", "Overdue"].includes(r.status)) return false;
    if (filter === "Overdue" && r.status !== "Overdue") return false;
    if (filter === "Paid" && r.status !== "Paid") return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      invNo(r.inv.invoice_number).toLowerCase().includes(q) ||
      (r.inv.customers?.name || "").toLowerCase().includes(q) ||
      (r.inv.projects ? `q${r.inv.projects.quote_number} ${siteAddress(r.inv.projects)}`.toLowerCase().includes(q) : false) ||
      (r.inv.customer_po || "").toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function exportIif(ids: string[]) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/invoices/export-iif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg({ ok: false, text: j.error || "Export failed" });
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `BetterBatt-invoices-${new Date().toISOString().slice(0, 10)}.iif`;
      a.click();
      setMsg({ ok: true, text: "Downloaded. In QuickBooks: File > Utilities > Import > IIF Files. Refresh this page to see them marked as exported." });
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  const toExport = selected.size > 0 ? Array.from(selected) : rows.filter((r) => r.status !== "Draft" && r.status !== "Void" && !r.inv.qb_exported_at).map((r) => r.inv.id);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Deposit and balance invoices from accepted quotes, payments, and the QuickBooks export.</p>
        </div>
        <Link href="/dashboard/invoices/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          New invoice
        </Link>
      </div>

      {setupError && (
        <p className="mt-4 rounded-lg bg-[#fde8e8] p-3 text-sm text-[#b91c1c]">
          Invoices aren&apos;t set up yet. Run migration 0031 in Supabase, then refresh. ({setupError})
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Outstanding</p>
          <p className="mt-1 text-xl font-bold">{money(outstandingTotal)}</p>
          <p className="text-xs text-[var(--muted)]">{outstanding.length} invoice{outstanding.length === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Overdue</p>
          <p className={`mt-1 text-xl font-bold ${overdue.length ? "text-[#b91c1c]" : ""}`}>{money(overdueTotal)}</p>
          <p className="text-xs text-[var(--muted)]">{overdue.length} invoice{overdue.length === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Not yet in QuickBooks</p>
          <p className="mt-1 text-xl font-bold">{notExported}</p>
          <p className="text-xs text-[var(--muted)]">sent invoices not exported</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-sm">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1 ${filter === f ? "bg-[#201f1c] text-white" : "text-[var(--muted)]"}`}>
              {f}
            </button>
          ))}
        </div>
        <input
          placeholder="Search invoice #, customer, quote, address, PO..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[16rem] rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => exportIif(toExport)}
          disabled={busy || toExport.length === 0}
          className="ml-auto rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {selected.size > 0 ? `Export ${selected.size} selected to QuickBooks (.iif)` : `Export ${toExport.length} new to QuickBooks (.iif)`}
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}

      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2 text-right">Total inc GST</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">QB</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ inv, paid, status }) => (
              <tr key={inv.id} className="border-t border-[var(--border)] hover:bg-black/[0.02]">
                <td className="px-3 py-2">
                  {status !== "Draft" && status !== "Void" && (
                    <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggle(inv.id)} />
                  )}
                </td>
                <td className="px-3 py-2 font-mono font-medium">
                  <Link href={`/dashboard/invoices/${inv.id}`} className="text-accent hover:underline">
                    {invNo(inv.invoice_number)}
                  </Link>
                </td>
                <td className="px-3 py-2">{inv.customers?.name || "—"}</td>
                <td className="px-3 py-2 text-[var(--muted)]">{inv.projects ? `Q${inv.projects.quote_number} · ${siteAddress(inv.projects)}` : "—"}</td>
                <td className="px-3 py-2">{inv.kind}</td>
                <td className="px-3 py-2">{fmtDate(inv.invoice_date)}</td>
                <td className="px-3 py-2">{fmtDate(inv.due_date)}</td>
                <td className="px-3 py-2 text-right">{money(inv.total)}</td>
                <td className="px-3 py-2 text-right">{status === "Void" ? "—" : money(Math.max(0, inv.total - paid))}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{status}</span>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--muted)]">{inv.qb_exported_at ? "✓ exported" : "—"}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-[var(--muted)]">
                  No invoices here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
