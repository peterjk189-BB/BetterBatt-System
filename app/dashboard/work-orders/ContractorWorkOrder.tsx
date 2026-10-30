"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lineRate } from "@/lib/woRate";
import { woLinePacks } from "@/lib/picking";
import JobProgressStrip from "./JobProgressStrip";
import { jobProgress, type ProgressInspection, type ProgressSwms } from "@/lib/jobProgress";

type WoLine = {
  id: string;
  qty: number;
  task_date: string | null;
  task_time: string | null;
  completed: boolean | null;
  note: string | null;
  rate?: number | null;
  parts: { name: string; installer_rate_per_m2?: number | null; coverage_m2?: number | null; is_stock_item?: boolean | null } | null;
};
type Extra = {
  id: string;
  description: string;
  qty: number;
  note: string | null;
  work_date: string | null;
  status: "Pending" | "Approved" | "Rejected";
  decision_note: string | null;
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : "—";

/**
 * What a contractor sees for a work order: the products and m² the office set (read-only), the job progress,
 * and a form to add extra items. Extras are requests: the office approves them when processing contractor pay.
 */
export default function ContractorWorkOrder({
  workOrder,
  site,
  lines,
  extras,
  subcontractorId,
  progress,
  invoicing,
}: {
  /** Tax invoicing for this contractor: switched on by the office; invoices already made for this job. */
  invoicing?: { enabled: boolean; invoices: { id: string; invoice_number: string; status: string }[] };
  workOrder: { id: string; wo_number: string; notes: string | null };
  site: string;
  lines: WoLine[];
  extras: Extra[];
  subcontractorId: string | null;
  progress: { swms: ProgressSwms[]; inspections: ProgressInspection[] };
}) {
  const supabase = createClient();
  const router = useRouter();
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" }));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!desc.trim()) return setError("Describe the item you did.");
    if (!subcontractorId) return setError("Your account isn't linked to a contractor yet — ask the office.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("work_order_extras").insert({
      work_order_id: workOrder.id,
      subcontractor_id: subcontractorId,
      description: desc.trim(),
      qty: Number(qty) || 1,
      work_date: date || null,
      note: note.trim() || null,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setDesc("");
    setQty("1");
    setNote("");
    router.refresh();
  }

  async function withdraw(id: string) {
    if (!confirm("Withdraw this item?")) return;
    await supabase.from("work_order_extras").delete().eq("id", id);
    router.refresh();
  }

  const priced = lines.map((l) => {
    const rate = lineRate(l.rate, null, l.parts?.installer_rate_per_m2 ?? null);
    return { ...l, rate, amount: (Number(l.qty) || 0) * rate };
  });
  const total = priced.reduce((a, l) => a + l.amount, 0);

  const input = "rounded-lg border border-[var(--border)] px-3 py-2 text-sm";
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/calendar" className="text-sm text-[var(--muted)] hover:underline">
        &larr; My schedule
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Work order {workOrder.wo_number}</h1>
      <p className="text-sm text-[var(--muted)]">{site || "Site address not set"}</p>

      <JobProgressStrip workOrderId={workOrder.id} swms={progress.swms} inspections={progress.inspections} canInspect={false} />

      <div className="mt-3">
        <Link
          href={`/dashboard/swms/new?work_order_id=${workOrder.id}&start=1`}
          className="inline-block rounded-lg bg-[#c1272d] px-4 py-2 text-sm font-bold text-white"
        >
          + Start SWMS for this job
        </Link>
      </div>

      {invoicing?.enabled && (() => {
        const p = jobProgress(progress.swms, progress.inspections);
        const ready = p.swmsDone && p.stage === "passed";
        return (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">Tax invoice</div>
                <div className="text-xs text-[var(--muted)]">
                  {ready ? "SWMS signed and inspection passed. You can invoice this job." : "Available once the SWMS is signed and the inspection has passed."}
                  {invoicing.invoices.length > 0 && ` Invoices so far: ${invoicing.invoices.map((i) => `${i.invoice_number} (${i.status})`).join(", ")}.`}
                </div>
              </div>
              <Link
                href={`/dashboard/work-orders/${workOrder.id}/invoice`}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${ready ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"}`}
              >
                {invoicing.invoices.length > 0 ? "View invoices" : ready ? "Create tax invoice" : "See what's needed"}
              </Link>
            </div>
          </div>
        );
      })()}

      {workOrder.notes && (
        <div className="mt-4 rounded-lg bg-[#f6f5f2] px-3.5 py-2.5 text-sm text-[#201f1c]">{workOrder.notes}</div>
      )}

      <h2 className="mt-6 text-lg font-bold">Job items</h2>
      <p className="text-xs text-[var(--muted)]">Set by the office — these can&apos;t be changed here. Amounts are ex GST.</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">m²</th>
              <th className="px-3 py-2 text-right">Packs</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {priced.map((l) => (
              <tr key={l.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">{l.parts?.name || "—"}</td>
                <td className="px-3 py-2 text-right">{l.qty}</td>
                <td className="px-3 py-2 text-right">{woLinePacks(l.qty, l.parts) ?? ""}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{money(l.rate)}</td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{money(l.amount)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {fmtDate(l.task_date)}
                  {l.task_time ? ` · ${l.task_time.slice(0, 5)}` : ""}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">{l.note || ""}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[var(--muted)]">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
          {priced.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] bg-[#f6f5f2] font-bold">
                <td className="px-3 py-2" colSpan={4}>
                  Total (ex GST)
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{money(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <h2 className="mt-8 text-lg font-bold">Extra items you&apos;ve added</h2>
      <p className="text-xs text-[var(--muted)]">
        Did extra work (call-out, extra bays, etc.)? Add it here. The office checks and approves it before it&apos;s included in your payment (approved items then appear in the table above).
      </p>
      <div className="mt-2 flex flex-col divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
        {extras.length === 0 && <div className="px-3 py-4 text-sm text-[var(--muted)]">Nothing added.</div>}
        {extras.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium">
                {x.description} <span className="font-normal text-[var(--muted)]">× {x.qty}</span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {fmtDate(x.work_date)}
                {x.note ? ` · ${x.note}` : ""}
                {x.status === "Rejected" && x.decision_note ? ` · Office: ${x.decision_note}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  x.status === "Approved" ? "bg-green-100 text-green-800" : x.status === "Rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {x.status === "Pending" ? "Awaiting approval" : x.status}
              </span>
              {x.status === "Pending" && (
                <button onClick={() => withdraw(x.id)} className="text-xs text-[var(--muted)] hover:underline">
                  Withdraw
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-12">
        <input className={`${input} col-span-2 sm:col-span-5`} placeholder="Item, e.g. Call-out fee" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <input className={`${input} sm:col-span-2`} type="number" step="0.01" min="0" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
        <input className={`${input} sm:col-span-3`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button onClick={add} disabled={busy} className="col-span-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">
          {busy ? "Adding…" : "Add item"}
        </button>
        <input className={`${input} col-span-2 sm:col-span-12`} placeholder="Note for the office (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
