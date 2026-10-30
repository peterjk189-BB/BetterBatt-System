"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import InvoicePaper from "@/app/dashboard/work-orders/InvoicePaper";

type Inv = {
  id: string;
  subcontractor_id: string;
  work_order_id: string;
  invoice_number: string;
  status: "Submitted" | "Approved" | "Rejected" | "Paid";
  contractor_name: string;
  contractor_abn: string | null;
  gst_registered: boolean;
  bank_account_name: string | null;
  bank_bsb: string | null;
  bank_account_number: string | null;
  site: string | null;
  wo_number: string | null;
  completed_date: string | null;
  lines: any[];
  unapproved_extras: any[];
  subtotal_ex: number;
  gst: number;
  total: number;
  note: string | null;
  swms_ok: boolean;
  inspection_ok: boolean;
  submitted_at: string;
  paid_at: string | null;
  reject_reason: string | null;
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const dt = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const STYLE: Record<string, string> = {
  Submitted: "bg-amber-100 text-amber-800",
  Approved: "bg-green-100 text-green-800",
  Paid: "bg-blue-100 text-blue-800",
  Rejected: "bg-red-100 text-red-800",
};
const FILTERS = ["Submitted", "Approved", "Paid", "Rejected", "All"] as const;

export default function ContractorInvoicesTable({ initial, pendingExtras, company }: { initial: Inv[]; pendingExtras: Record<string, number>; company: { name: string; abn: string | null } }) {
  const supabase = createClient();
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Submitted");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => rows.filter((r) => filter === "All" || r.status === filter), [rows, filter]);
  const count = (f: string) => rows.filter((r) => f === "All" || r.status === f).length;

  async function setStatus(r: Inv, status: Inv["status"], extra: Record<string, any> = {}) {
    setBusy(r.id);
    setError(null);
    const { data: u } = await supabase.auth.getUser();
    const patch: any = { status, ...extra };
    if (status === "Approved" || status === "Rejected") {
      patch.decided_at = new Date().toISOString();
      patch.decided_by = u.user?.id ?? null;
    }
    const { data, error: err } = await supabase.from("contractor_invoices").update(patch).eq("id", r.id).select().single();
    setBusy(null);
    if (err || !data) return setError(err?.message || "Couldn't update.");
    setRows((prev) => prev.map((x) => (x.id === r.id ? (data as Inv) : x)));
    logAudit(supabase, { eventType: "update", entityType: "contractor_invoice", entityId: r.id, entityLabel: `${r.invoice_number} (${r.contractor_name})`, details: `Status: ${status}` });
  }

  function reject(r: Inv) {
    const reason = prompt("Why is this invoice being sent back? The contractor will see this.");
    if (reason === null) return;
    setStatus(r, "Rejected", { reject_reason: reason.trim() || null });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f ? "border-accent bg-accent text-white" : "border-[var(--border)] text-[var(--muted)]"}`}
          >
            {f} ({count(f)})
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Contractor</th>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">SWMS</th>
              <th className="px-3 py-2">Inspection</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const extras = pendingExtras[`${r.work_order_id}|${r.subcontractor_id}`] || 0;
              return (
                <tr key={r.id} className="border-t border-[var(--border)] align-top">
                  <td className="px-3 py-2">
                    <button onClick={() => setOpen(open === r.id ? null : r.id)} className="font-mono font-medium text-accent hover:underline">
                      {r.invoice_number}
                    </button>
                    <div className="text-xs text-[var(--muted)]">{dt(r.submitted_at)}</div>
                  </td>
                  <td className="px-3 py-2">{r.contractor_name}</td>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/work-orders/${r.work_order_id}`} className="text-accent hover:underline">
                      WO{r.wo_number}
                    </Link>
                    <div className="max-w-[200px] truncate text-xs text-[var(--muted)]">{r.site}</div>
                  </td>
                  <td className="px-3 py-2">{r.swms_ok ? <span className="text-green-700">✓ Signed</span> : <span className="text-red-700">✗</span>}</td>
                  <td className="px-3 py-2">{r.inspection_ok ? <span className="text-green-700">✓ Passed</span> : <span className="text-red-700">✗</span>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{money(r.total)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[r.status]}`}>{r.status}</span>
                    {extras > 0 && (
                      <Link href="/dashboard/contractor-payments" className="mt-1 block text-xs font-medium text-red-700 hover:underline">
                        {extras} extra{extras > 1 ? "s" : ""} to approve
                      </Link>
                    )}
                    {r.status === "Paid" && r.paid_at && <div className="text-xs text-[var(--muted)]">{dt(r.paid_at)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.status === "Submitted" && (
                      <>
                        <button onClick={() => setStatus(r, "Approved")} disabled={busy === r.id || !r.swms_ok || !r.inspection_ok} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" title={!r.swms_ok || !r.inspection_ok ? "SWMS and inspection must both be done" : ""}>
                          Approve
                        </button>
                        <button onClick={() => reject(r)} disabled={busy === r.id} className="ml-2 text-xs text-[var(--muted)] hover:underline">
                          Send back
                        </button>
                      </>
                    )}
                    {r.status === "Approved" && (
                      <button onClick={() => setStatus(r, "Paid", { paid_at: new Date().toISOString() })} disabled={busy === r.id} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-accent">
                        Mark paid
                      </button>
                    )}
                    {r.status === "Paid" && (
                      <button onClick={() => setStatus(r, "Approved", { paid_at: null })} disabled={busy === r.id} className="text-xs text-[var(--muted)] hover:underline">
                        Undo paid
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--muted)]">
                  No {filter === "All" ? "" : filter.toLowerCase() + " "}invoices.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (() => {
        const r = rows.find((x) => x.id === open);
        if (!r) return null;
        return (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-bold">Invoice {r.invoice_number}</h2>
              <button onClick={() => setOpen(null)} className="text-sm text-[var(--muted)] hover:underline">
                Close
              </button>
            </div>
            <InvoicePaper inv={{ ...r, date: r.submitted_at }} company={company} />
          </div>
        );
      })()}
    </div>
  );
}
