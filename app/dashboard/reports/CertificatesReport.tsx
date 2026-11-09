"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { certificateNumber } from "@/lib/certificate";
import { money } from "@/lib/invoices";
import type { PlInvoice, PlPayment } from "./ProfitLossReport";

export type CertInspection = {
  id: string;
  inspection_number: number;
  inspection_date: string | null;
  builder_name: string | null;
  site_address: string | null;
  suburb: string | null;
  project_id: string | null;
  work_order_id: string | null;
  certificate_sent_at?: string | null;
  projects?: { quote_number: number | null; customers?: { name: string | null } | null } | null;
  work_orders?: { wo_number: string | null; project_id: string | null; projects?: { quote_number: number | null; customers?: { name: string | null } | null } | null } | null;
};

type Status = "sent" | "due" | "pending";
type Filter = "outstanding" | "due" | "pending" | "sent" | "all";

const fmtDate = (d: string | null | undefined) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-AU") : "—");

export default function CertificatesReport({
  inspections,
  invoices,
  payments,
  sentColumn,
}: {
  inspections: CertInspection[];
  invoices: PlInvoice[];
  payments: PlPayment[];
  sentColumn: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [sentAt, setSentAt] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState<Filter>("outstanding");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const paidBy = new Map<string, number>();
    payments.forEach((p) => paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + (Number(p.amount) || 0)));
    const invBy = new Map<string, PlInvoice[]>();
    invoices.forEach((i: any) => {
      if (!i.project_id || i.status === "Void" || i.status === "Draft") return;
      invBy.set(i.project_id, [...(invBy.get(i.project_id) ?? []), i]);
    });

    return inspections.map((ins) => {
      const projectId = ins.project_id || ins.work_orders?.project_id || null;
      const proj = ins.projects || ins.work_orders?.projects || null;
      const invs = projectId ? invBy.get(projectId) ?? [] : [];
      const billed = invs.reduce((s, i: any) => s + (Number(i.total) || 0), 0);
      const paid = invs.reduce((s, i: any) => s + Math.min(Number(i.total) || 0, paidBy.get(i.id) ?? 0), 0);
      const owing = Math.max(0, Math.round((billed - paid) * 100) / 100);
      const sent = sentAt[ins.id] !== undefined ? sentAt[ins.id] : ins.certificate_sent_at ?? null;
      const invoiceNote = invs.length === 0 ? "No invoice issued" : owing > 0.005 ? `${money(owing)} owing` : "Paid";
      const paidInFull = invs.length > 0 && owing <= 0.005;
      const status: Status = sent ? "sent" : paidInFull ? "due" : "pending";
      const daysWaiting = ins.inspection_date ? Math.floor((Date.now() - new Date(ins.inspection_date.slice(0, 10) + "T00:00:00").getTime()) / 86400000) : 0;
      return {
        ins,
        status,
        sent,
        invoiceNote,
        owing,
        daysWaiting,
        quote: proj?.quote_number ?? null,
        customer: proj?.customers?.name || ins.builder_name || "—",
        address: [ins.site_address, ins.suburb].filter(Boolean).join(", ") || "—",
      };
    });
  }, [inspections, invoices, payments, sentAt]);

  const counts = {
    due: rows.filter((r) => r.status === "due").length,
    pending: rows.filter((r) => r.status === "pending").length,
    sent: rows.filter((r) => r.status === "sent").length,
  };
  const outstanding = counts.due + counts.pending;
  const pendingOwing = rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.owing, 0);

  const shown = rows
    .filter((r) => (filter === "all" ? true : filter === "outstanding" ? r.status !== "sent" : r.status === filter))
    .sort((a, b) => {
      const order = { due: 0, pending: 1, sent: 2 } as const;
      return order[a.status] - order[b.status] || (b.ins.inspection_date || "").localeCompare(a.ins.inspection_date || "");
    });

  async function mark(id: string, sent: boolean) {
    setBusy(id);
    setError(null);
    const value = sent ? new Date().toISOString() : null;
    const { error: upErr } = await supabase.from("inspections").update({ certificate_sent_at: value }).eq("id", id);
    setBusy(null);
    if (upErr) {
      setError(/certificate_sent_at/.test(upErr.message) ? "Run migration 0092 in Supabase first, then try again." : upErr.message);
      return;
    }
    setSentAt((m) => ({ ...m, [id]: value }));
  }

  const card = (key: Filter, title: string, big: string, sub: string, tone?: string) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`rounded-xl border p-4 text-left ${filter === key ? "border-accent ring-1 ring-accent" : "border-[var(--border)]"} bg-[var(--surface)]`}
    >
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{title}</div>
      <div className={`mt-1 text-3xl font-bold ${tone ?? ""}`}>{big}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>
    </button>
  );

  const badge: Record<Status, string> = {
    due: "bg-green-100 text-green-800",
    pending: "bg-amber-100 text-amber-800",
    sent: "bg-blue-100 text-blue-800",
  };
  const badgeText: Record<Status, string> = { due: "Due to send", pending: "Pending payment", sent: "Sent" };

  return (
    <div className="mt-5">
      <p className="max-w-3xl text-sm text-[var(--muted)]">
        Every passed inspection needs an insulation certificate. It is emailed to the customer once their invoice is paid. <b>Due to send</b> means paid and not yet sent.
        <b> Pending payment</b> means the invoice is still owing (or not issued yet). Press <b>Mark sent</b> when you have emailed it.
      </p>

      {!sentColumn && (
        <div className="mt-3 rounded-lg border border-[#f3d48a] bg-[#fff8e6] px-4 py-2.5 text-sm text-[#5c440b]">
          Run migration <b>0092</b> (certificate sent date) in Supabase so Sent can be recorded. Until then every certificate counts as not sent.
        </div>
      )}
      {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {card("outstanding", "Outstanding", String(outstanding), "passed, certificate not sent yet")}
        {card("due", "Due to send now", String(counts.due), "invoice paid, not yet sent", counts.due > 0 ? "text-green-700" : "")}
        {card("pending", "Pending payment", String(counts.pending), pendingOwing > 0 ? `${money(pendingOwing)} owing on these` : "waiting on invoice / payment", counts.pending > 0 ? "text-amber-700" : "")}
        {card("sent", "Sent", String(counts.sent), "certificate emailed", "text-blue-700")}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {([["outstanding", "Outstanding"], ["due", "Due to send"], ["pending", "Pending payment"], ["sent", "Sent"], ["all", "All"]] as [Filter, string][]).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 text-sm ${filter === k ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--muted)]">
              <th className="px-3 py-2">Certificate</th>
              <th className="px-3 py-2">Quote</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2">Inspected</th>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--muted)]">Nothing here.</td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.ins.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/dashboard/inspections/${r.ins.id}/certificate`} className="text-accent hover:underline">
                    {certificateNumber(r.ins.inspection_number)}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.quote ? `Q${r.quote}` : "—"}</td>
                <td className="px-3 py-2">{r.customer}</td>
                <td className="px-3 py-2">{r.address}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {fmtDate(r.ins.inspection_date)}
                  {r.status !== "sent" && r.daysWaiting > 0 && (
                    <div className={`text-xs ${r.status === "due" && r.daysWaiting > 7 ? "font-semibold text-red-700" : "text-[var(--muted)]"}`}>{r.daysWaiting} days ago</div>
                  )}
                </td>
                <td className={`px-3 py-2 ${r.owing > 0.005 ? "text-amber-700" : r.invoiceNote === "Paid" ? "text-green-700" : "text-[var(--muted)]"}`}>{r.invoiceNote}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge[r.status]}`}>{badgeText[r.status]}</span>
                  {r.sent && <div className="mt-0.5 text-xs text-[var(--muted)]">{fmtDate(r.sent)}</div>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link href={`/dashboard/inspections/${r.ins.id}/certificate`} className="mr-3 text-accent hover:underline">Open</Link>
                  {r.sent ? (
                    <button type="button" disabled={busy === r.ins.id} onClick={() => mark(r.ins.id, false)} className="text-[var(--muted)] hover:underline disabled:opacity-60">
                      Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === r.ins.id}
                      onClick={() => mark(r.ins.id, true)}
                      className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm font-medium hover:border-accent disabled:opacity-60"
                    >
                      {busy === r.ins.id ? "…" : "Mark sent"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
