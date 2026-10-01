"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type Line = {
  task_date: string | null;
  qty: number;
  note: string | null;
  parts: { name: string } | null;
  labour_items: { code: string; description: string; contractor_rate: number } | null;
};

type WorkOrder = {
  id: string;
  wo_number: string;
  po_number: string | null;
  po_value: number | null;
  entry_date: string | null;
  completed_date: string | null;
  jsa_received: boolean;
  notes: string | null;
  projects: {
    quote_number: number;
    address: string | null;
    suburb: string | null;
    customers: { name: string } | null;
  } | null;
  subcontractors: { name: string; phone: string | null; email: string | null } | null;
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  const weekday = date.toLocaleDateString("en-AU", { weekday: "long" });
  return `${weekday}, ${date.toLocaleDateString("en-AU")}`;
}

export default function WorkOrderPrintView({ workOrder, lines }: { workOrder: WorkOrder; lines: Line[] }) {
  const printableRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    if (!printableRef.current) return;
    setDownloading(true);
    try {
      const [html2canvasMod, jsPdfMod] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const html2canvas: any = (html2canvasMod as any).default || html2canvasMod;
      const jsPDF: any = (jsPdfMod as any).jsPDF || (jsPdfMod as any).default;
      const canvas = await html2canvas(printableRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`WorkOrder-${workOrder.wo_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  const computed = lines.map((l) => {
    const rate = l.labour_items?.contractor_rate || 0;
    const cost = (Number(l.qty) || 0) * rate;
    return { ...l, cost };
  });
  const contractorTotal = computed.reduce((s, l) => s + l.cost, 0);

  const siteLine = workOrder.projects
    ? [workOrder.projects.address, workOrder.projects.suburb].filter(Boolean).join(", ")
    : "—";

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link
          href={`/dashboard/work-orders/${workOrder.id}`}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          &larr; Back to work order
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          Print
        </button>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {downloading ? "Preparing PDF..." : "Download PDF"}
        </button>
        <span className="text-xs text-[var(--muted)]">
          Downloads a PDF file you can email to the contractor.
        </span>
      </div>

      <div
        ref={printableRef}
        className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-10 text-black print:border-none print:p-0"
      >
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
                <div className="text-xs text-gray-300">Work Order</div>
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
              {workOrder.projects ? `Q${workOrder.projects.quote_number} — ${workOrder.projects.customers?.name || "—"}` : "—"}
            </div>
            <div className="text-gray-600">{siteLine}</div>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Contractor</div>
            <div className="mt-0.5 font-semibold">{workOrder.subcontractors?.name || "—"}</div>
            <div className="text-gray-600">
              {[workOrder.subcontractors?.phone, workOrder.subcontractors?.email].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">P/O number</div>
            <div className="mt-0.5 font-semibold">{workOrder.po_number || "—"}</div>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Entry date</div>
            <div className="mt-0.5 font-semibold">{fmtDate(workOrder.entry_date)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Completed date</div>
            <div className="mt-0.5 font-semibold">{fmtDate(workOrder.completed_date)}</div>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <th className="rounded-l-lg px-2 py-1.5">Date</th>
              <th className="px-2 py-1.5">Task</th>
              <th className="px-2 py-1.5">Product</th>
              <th className="px-2 py-1.5 text-right">Qty</th>
              <th className="rounded-r-lg px-2 py-1.5 text-right">Contractor $</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((l, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-2 py-2 text-gray-500">{fmtDate(l.task_date)}</td>
                <td className="px-2 py-2">
                  {l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—"}
                </td>
                <td className="px-2 py-2 text-gray-600">{l.parts?.name || "—"}</td>
                <td className="px-2 py-2 text-right">{l.qty}</td>
                <td className="px-2 py-2 text-right font-medium">{fmtCurrency(l.cost)}</td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-400">
                  No task lines.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {workOrder.notes && <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">{workOrder.notes}</div>}

        <div className="mt-5 flex justify-end">
          <div className="w-64 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex justify-between text-base font-bold">
              <span>Contractor total</span>
              <span>{fmtCurrency(contractorTotal)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
          <span>Better Batt Insulation</span>
          <span>JSA received: {workOrder.jsa_received ? "Yes" : "No"}</span>
        </div>
      </div>
    </div>
  );
}
