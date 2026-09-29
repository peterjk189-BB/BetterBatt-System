"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type PO = {
  id: string;
  po_number: string | null;
  status: "Draft" | "Ordered" | "Received";
  order_date: string | null;
  archived: boolean;
  suppliers: { name: string } | null;
};

type Line = { purchase_order_id: string; part_id: string | null; qty_multi: number; qty_pks: number; unit_cost: number | null };
type Part = { id: string; pack_per_multi: number };

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-200 text-gray-700",
  Ordered: "bg-blue-100 text-blue-800",
  Received: "bg-green-100 text-green-800",
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function PurchaseOrdersList({ initial, lines, parts }: { initial: PO[]; lines: Line[]; parts: Part[] }) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of lines) {
      const part = l.part_id ? partById[l.part_id] : undefined;
      const packs = (part?.pack_per_multi || 0) * l.qty_multi + l.qty_pks;
      map[l.purchase_order_id] = (map[l.purchase_order_id] || 0) + packs * (l.unit_cost || 0);
    }
    return map;
  }, [lines, partById]);

  const visible = initial
    .filter((p) => p.archived === showArchived)
    .filter((p) => {
      const q = search.toLowerCase();
      if (!q) return true;
      return (p.po_number || "").toLowerCase().includes(q) || (p.suppliers?.name || "").toLowerCase().includes(q);
    });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase orders</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Orders placed with suppliers to restock inventory.</p>
        </div>
        <Link
          href="/dashboard/purchase-orders/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          New purchase order
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <input
          placeholder="Search P/O #, supplier..."
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
              <th className="px-4 py-2">P/O #</th>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Order date</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((po) => (
              <tr key={po.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono font-medium">
                  <Link href={`/dashboard/purchase-orders/${po.id}`} className="text-accent hover:underline">
                    {po.po_number || "—"}
                  </Link>
                </td>
                <td className="px-4 py-2">{po.suppliers?.name || "—"}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{po.order_date || "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[po.status]}`}>{po.status}</span>
                </td>
                <td className="px-4 py-2 text-right font-medium">{fmtCurrency(totals[po.id] || 0)}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                  No {showArchived ? "archived" : ""} purchase orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
