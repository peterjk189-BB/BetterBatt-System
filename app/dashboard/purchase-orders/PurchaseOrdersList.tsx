"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type PO = {
  id: string;
  po_number: string | null;
  status: "Draft" | "Ordered" | "Received";
  order_date: string | null;
  delivery_address: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  archived: boolean;
  suppliers: { name: string } | null;
};

type Line = { purchase_order_id: string; part_id: string | null; qty_pks: number; unit_cost: number | null };
type Part = { id: string; pack_per_multi: number };

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-200 text-gray-700",
  Ordered: "bg-blue-100 text-blue-800",
  Received: "bg-green-100 text-green-800",
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-AU") : "—";
}

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m} ${period}`;
}

export default function PurchaseOrdersList({ initial, lines, parts }: { initial: PO[]; lines: Line[]; parts: Part[] }) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Ordered quantity is always in packs, so the subtotal is just packs × unit cost.
  // The displayed total includes GST (10%).
  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of lines) {
      map[l.purchase_order_id] = (map[l.purchase_order_id] || 0) + l.qty_pks * (l.unit_cost || 0);
    }
    for (const key of Object.keys(map)) {
      map[key] = map[key] * 1.1;
    }
    return map;
  }, [lines]);

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
              <th className="px-4 py-2">Delivery date</th>
              <th className="px-4 py-2">Delivery address</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Total (inc GST)</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((po) => {
              const deliveryWhen = [fmtDate(po.delivery_date), fmtTime(po.delivery_time)].filter(Boolean).join(" · ");
              return (
                <tr key={po.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 font-mono font-medium">
                    <Link href={`/dashboard/purchase-orders/${po.id}`} className="text-accent hover:underline">
                      {po.po_number || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{po.suppliers?.name || "—"}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{po.order_date || "—"}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{po.delivery_date ? deliveryWhen : "—"}</td>
                  <td className="max-w-xs whitespace-normal break-words px-4 py-2 text-[var(--muted)]">
                    {po.delivery_address || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[po.status]}`}>{po.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{fmtCurrency(totals[po.id] || 0)}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
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
