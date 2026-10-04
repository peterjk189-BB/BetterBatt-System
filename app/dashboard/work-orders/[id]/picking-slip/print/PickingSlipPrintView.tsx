"use client";

import Link from "next/link";
import { packsNeeded } from "@/lib/picking";

type Line = {
  id: string;
  qty: number;
  note: string | null;
  part_id: string;
  picked: boolean;
  packs_picked: number | null;
  parts: { name: string; code: string | null; coverage_m2: number };
};

type WorkOrder = {
  id: string;
  wo_number: string;
  address: string | null;
  customerName: string | null;
  quoteNumber: number | null;
};

export default function PickingSlipPrintView({ workOrder, lines }: { workOrder: WorkOrder; lines: Line[] }) {
  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link
          href={`/dashboard/work-orders/${workOrder.id}/picking-slip`}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          &larr; Back to picking slip
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Print
        </button>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
          }
        }
      `}</style>

      <div className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-10 text-black print:border-none print:p-0">
        <div className="flex flex-col gap-5 rounded-xl bg-[#141413] px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                className="h-10 w-auto rounded bg-white/90 object-contain p-0.5"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div>
                <div className="text-xl font-bold">Better Batt Insulation</div>
                <div className="text-xs text-gray-300">Picking Slip</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-gray-300">Work Order</div>
              <div className="text-2xl font-bold">{workOrder.wo_number}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Job</div>
            <div className="mt-0.5 font-semibold">
              {workOrder.quoteNumber ? `Q${workOrder.quoteNumber} — ` : ""}
              {workOrder.customerName || "—"}
            </div>
            <div className="text-gray-600">{workOrder.address || "—"}</div>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Date printed</div>
            <div className="mt-0.5 font-semibold">{today}</div>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <th className="rounded-l-lg px-2 py-1.5">Code</th>
              <th className="px-2 py-1.5">Product</th>
              <th className="px-2 py-1.5">Notes</th>
              <th className="px-2 py-1.5 text-right">Packs to pick</th>
              <th className="rounded-r-lg px-2 py-1.5 text-center">Picked</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const needed = l.picked ? Number(l.packs_picked) || 0 : packsNeeded(Number(l.qty) || 0, Number(l.parts.coverage_m2) || 0);
              return (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 text-gray-500">{l.parts.code || "—"}</td>
                  <td className="px-2 py-2 font-medium">{l.parts.name}</td>
                  <td className="px-2 py-2 text-gray-600">{l.note || "—"}</td>
                  <td className="px-2 py-2 text-right font-semibold">{needed} pack{needed === 1 ? "" : "s"}</td>
                  <td className="px-2 py-2 text-center">
                    <span className="inline-block h-4 w-4 rounded border border-gray-400">{l.picked ? "✓" : ""}</span>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-400">
                  No material lines on this work order.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-6 flex justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
          <span>Better Batt Insulation</span>
          <span>Picked by: _______________________</span>
        </div>
      </div>
    </div>
  );
}
