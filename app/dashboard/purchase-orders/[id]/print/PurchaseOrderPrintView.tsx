"use client";

import Link from "next/link";

type Line = {
  qty_pks: number;
  unit_cost: number | null;
  parts: { name: string } | null;
};

type PurchaseOrder = {
  id: string;
  po_number: string | null;
  status: string;
  order_date: string | null;
  delivery_address: string | null;
  site_contact_name: string | null;
  site_contact_phone: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  notes: string | null;
  suppliers: { name: string } | null;
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

export default function PurchaseOrderPrintView({
  purchaseOrder,
  lines,
}: {
  purchaseOrder: PurchaseOrder;
  lines: Line[];
}) {
  const computed = lines.map((l) => ({
    ...l,
    lineTotal: (Number(l.qty_pks) || 0) * (Number(l.unit_cost) || 0),
  }));
  const subtotal = computed.reduce((s, l) => s + l.lineTotal, 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;

  const deliveryWhen = [fmtDate(purchaseOrder.delivery_date), fmtTime(purchaseOrder.delivery_time)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link
          href={`/dashboard/purchase-orders/${purchaseOrder.id}`}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          &larr; Back to purchase order
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-10 text-black print:border-none print:p-0">
        <div className="flex flex-col gap-5 rounded-xl bg-[#141413] px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold">Better Batt Insulation</div>
              <div className="text-xs text-gray-300">Purchase Order</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-gray-300">PO Number</div>
              <div className="text-2xl font-bold">{purchaseOrder.po_number || "—"}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Supplier</div>
            <div className="mt-0.5 font-semibold">{purchaseOrder.suppliers?.name || "—"}</div>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Order date</div>
            <div className="mt-0.5 font-semibold">{fmtDate(purchaseOrder.order_date)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Delivery</div>
            <div className="mt-0.5 font-semibold">{deliveryWhen || "—"}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Deliver to</div>
            <div className="mt-0.5 font-semibold">{purchaseOrder.delivery_address || "—"}</div>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Site contact</div>
            <div className="mt-0.5 font-semibold">
              {[purchaseOrder.site_contact_name, purchaseOrder.site_contact_phone].filter(Boolean).join(" · ") ||
                "—"}
            </div>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <th className="rounded-l-lg px-2 py-1.5">Item</th>
              <th className="px-2 py-1.5 text-right">Pks</th>
              <th className="px-2 py-1.5 text-right">Unit cost</th>
              <th className="rounded-r-lg px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((l, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-2 py-2">{l.parts?.name || "—"}</td>
                <td className="px-2 py-2 text-right">{l.qty_pks}</td>
                <td className="px-2 py-2 text-right">{fmtCurrency(Number(l.unit_cost) || 0)}</td>
                <td className="px-2 py-2 text-right font-medium">{fmtCurrency(l.lineTotal)}</td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-400">
                  No line items.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {purchaseOrder.notes && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">{purchaseOrder.notes}</div>
        )}

        <div className="mt-5 flex justify-end">
          <div className="w-64 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex justify-between py-0.5 text-gray-500">
              <span>Subtotal (ex GST)</span>
              <span className="text-black">{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-gray-500">
              <span>GST (10%)</span>
              <span className="text-black">{fmtCurrency(gst)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-gray-200 pt-1.5 text-base font-bold">
              <span>Total (inc GST)</span>
              <span>{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
          <span>Better Batt Insulation</span>
          <span>Received by: ______________________</span>
        </div>
      </div>
    </div>
  );
}
