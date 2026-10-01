"use client";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";

type Line = {
  part_id: string | null;
  qty_m2: number;
  note: string | null;
  parts: {
    name: string;
    coverage_m2: number;
    supply_charge_per_pack: number;
    supply_install_rate_per_m2: number;
  } | null;
};

type Project = {
  id: string;
  quote_number: number;
  job_type: string;
  lot_no: string | null;
  address: string | null;
  suburb: string | null;
  entry_date: string;
  notes: string | null;
  quote_markup: number;
  show_qty_on_quote: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  customers: { name: string; discount_pct: number | null } | null;
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function QuotePrintView({ project, lines }: { project: Project; lines: Line[] }) {
  const printableRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    if (!printableRef.current) return;
    setDownloading(true);
    try {
      // Both libraries have shipped slightly different export shapes across versions, so
      // fall back between named/default rather than assuming one or the other.
      const [html2canvasMod, jsPdfMod] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const html2canvas: any = (html2canvasMod as any).default || html2canvasMod;
      const jsPDF: any = (jsPdfMod as any).jsPDF || (jsPdfMod as any).default;
      const canvas = await html2canvas(printableRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");

      // Fit the captured page onto A4, scaling by width and splitting across extra
      // pages if the content runs taller than one page.
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

      pdf.save(`Quote-Q${project.quote_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  const isSupplyOnly = project.job_type === "SUPPLY ONLY";

  const computed = lines.map((l) => {
    const part = l.parts;
    if (!part) return { ...l, packs: 0, charge: 0 };
    const packs = part.coverage_m2 > 0 ? Math.ceil(l.qty_m2 / part.coverage_m2) : 0;
    const usedForCal = packs * part.coverage_m2;
    const charge = isSupplyOnly ? packs * part.supply_charge_per_pack : usedForCal * part.supply_install_rate_per_m2;
    return { ...l, packs, charge };
  });

  const customerDiscountPct = project.customers?.discount_pct || 0;
  const chargeBeforeMarkup = computed.reduce((s, l) => s + l.charge, 0);
  const customerDiscountTotal = chargeBeforeMarkup * (customerDiscountPct / 100);
  const subtotal = chargeBeforeMarkup - customerDiscountTotal + Number(project.quote_markup || 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 print:hidden">
        <Link
          href={`/dashboard/quotes/${project.id}`}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          &larr; Back to quote
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
          Downloads a PDF file you can attach to an email in Outlook.
        </span>
      </div>

      <div
        ref={printableRef}
        className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-10 text-black print:border-none print:p-0"
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="text-2xl font-semibold">Quote Q{project.quote_number}</div>
            <div className="mt-1 text-sm text-gray-500">
              {project.entry_date ? new Date(project.entry_date).toLocaleDateString("en-AU") : ""}
            </div>
          </div>
          <div className="text-right text-sm text-gray-500">
            {project.lot_no && <div>Lot {project.lot_no}</div>}
            <div>{project.address}</div>
            <div>{project.suburb}</div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="mb-1 text-xs text-gray-500">Customer</div>
            <div className="font-medium">{project.customers?.name || "—"}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">Contact</div>
            {project.contact_name && <div>{project.contact_name}</div>}
            {project.contact_phone && <div>{project.contact_phone}</div>}
            {project.contact_email && <div>{project.contact_email}</div>}
            {!project.contact_name && !project.contact_phone && !project.contact_email && <div>—</div>}
          </div>
        </div>

        <table className="mb-2 w-full border-t border-gray-200 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="py-2">Product</th>
              {project.show_qty_on_quote && <th className="py-2 text-right">Qty (m²)</th>}
              <th className="py-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((l, i) => (
              <Fragment key={i}>
                <tr className="border-t border-gray-200">
                  <td className="py-2">{l.parts?.name || "—"}</td>
                  {project.show_qty_on_quote && <td className="py-2 text-right">{l.qty_m2} m²</td>}
                  <td className="py-2 text-right">{fmtCurrency(l.charge)}</td>
                </tr>
                {l.note && (
                  <tr>
                    <td colSpan={project.show_qty_on_quote ? 3 : 2} className="pb-2 text-xs text-gray-500">
                      {l.note}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={project.show_qty_on_quote ? 3 : 2} className="py-6 text-center text-gray-400">
                  No line items.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {project.notes && (
          <div className="mb-6 mt-4 rounded-lg bg-gray-50 p-3 text-sm">{project.notes}</div>
        )}

        <div className="mt-6 flex justify-end">
          <div className="w-64 text-sm">
            {/* Customer discount is folded into the subtotal below but not itemized here —
                it's commercial info the customer doesn't need to see broken out. */}
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Subtotal</span>
              <span>{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">GST (10%)</span>
              <span>{fmtCurrency(gst)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 py-2 text-base font-semibold">
              <span>Total</span>
              <span>{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
