"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STAGE_LABEL, STAGE_STYLE, jobProgress, type ProgressInspection, type ProgressSwms } from "@/lib/jobProgress";

type WorkOrder = {
  id: string;
  wo_number: string;
  project_id: string | null;
  contractor_id: string | null;
  po_number: string | null;
  po_value: number | null;
  jsa_received: boolean;
  archived: boolean;
  projects: { quote_number: number; address: string | null; suburb: string | null; customers: { name: string } | null } | null;
  subcontractors: { name: string } | null;
};

type Line = { work_order_id: string; labour_item_id: string | null; qty: number };
type LabourItem = { id: string; contractor_rate: number };

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function WorkOrdersList({
  initial,
  lines,
  labourItems,
  swms,
  inspections,
}: {
  initial: WorkOrder[];
  lines: Line[];
  labourItems: LabourItem[];
  swms: (ProgressSwms & { work_order_id: string })[];
  inspections: (ProgressInspection & { work_order_id: string })[];
}) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const rateById = useMemo(() => Object.fromEntries(labourItems.map((l) => [l.id, l.contractor_rate])), [labourItems]);

  const stats = useMemo(() => {
    const map: Record<string, { count: number; cost: number }> = {};
    for (const l of lines) {
      const rate = l.labour_item_id ? rateById[l.labour_item_id] || 0 : 0;
      if (!map[l.work_order_id]) map[l.work_order_id] = { count: 0, cost: 0 };
      map[l.work_order_id].count += 1;
      map[l.work_order_id].cost += rate * l.qty;
    }
    return map;
  }, [lines, rateById]);

  const visible = initial
    .filter((w) => w.archived === showArchived)
    .filter((w) => {
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        w.wo_number.toLowerCase().includes(q) ||
        (w.projects?.customers?.name || "").toLowerCase().includes(q) ||
        (w.subcontractors?.name || "").toLowerCase().includes(q) ||
        (w.po_number || "").toLowerCase().includes(q) ||
        (w.projects?.address || "").toLowerCase().includes(q) ||
        (w.projects?.suburb || "").toLowerCase().includes(q) ||
        `${w.projects?.address || ""} ${w.projects?.suburb || ""}`.toLowerCase().includes(q)
      );
    });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Work orders</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Purchase orders issued to contractors, with task-by-task completion and pay tracking.
          </p>
        </div>
        <Link
          href="/dashboard/work-orders/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Add work order
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <input
          placeholder="Search work order #, customer, address, contractor, P/O..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <button onClick={() => setShowArchived((v) => !v)} className="text-sm text-[var(--muted)] underline">
          {showArchived ? "View active" : "View archived"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Work order #</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Job</th>
              <th className="px-4 py-2">Contractor</th>
              <th className="px-4 py-2">P/O #</th>
              <th className="px-4 py-2 text-right">P/O value</th>
              <th className="px-4 py-2 text-right">Tasks</th>
              <th className="px-4 py-2 text-right">Contractor cost</th>
              <th className="px-4 py-2">JSA</th>
              <th className="px-4 py-2">Job status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((w) => {
              const s = stats[w.id] || { count: 0, cost: 0 };
              const stage = jobProgress(
                swms.filter((x) => x.work_order_id === w.id),
                inspections.filter((x) => x.work_order_id === w.id)
              ).stage;
              return (
                <tr key={w.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 font-mono font-medium">
                    <Link href={`/dashboard/work-orders/${w.id}`} className="text-accent hover:underline">
                      {w.wo_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{w.projects?.customers?.name || "—"}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">
                    {w.projects ? `${w.projects.address || ""}${w.projects.suburb ? ", " + w.projects.suburb : ""}` : "—"}
                  </td>
                  <td className="px-4 py-2">{w.subcontractors?.name || "Unassigned"}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{w.po_number || "—"}</td>
                  <td className="px-4 py-2 text-right">{fmtCurrency(w.po_value || 0)}</td>
                  <td className="px-4 py-2 text-right">{s.count}</td>
                  <td className="px-4 py-2 text-right">{fmtCurrency(s.cost)}</td>
                  <td className="px-4 py-2">
                    {w.jsa_received ? (
                      <span className="text-green-700">✓</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLE[stage]}`}>
                      {STAGE_LABEL[stage]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-[var(--muted)]">
                  No {showArchived ? "archived" : ""} work orders found — open an accepted quote and start
                  one, or add manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
