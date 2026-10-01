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
        className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-12 text-black print:border-none print:p-0"
      >
        <div className="flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Better Batt Insulation"
            className="h-10 w-auto object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Quote</div>
            <div className="text-3xl font-light">Q{project.quote_number}</div>
          </div>
        </div>

        <div className="mt-5 h-0.5 w-16 bg-[#fdb930]" />

        <div className="mt-6 flex justify-between text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Prepared for</div>
            <div className="mt-1 text-[15px] font-semibold">{project.customers?.name || "—"}</div>
            {(project.contact_name || project.contact_phone) && (
              <div className="mt-0.5 text-gray-500">
                {[project.contact_name, project.contact_phone].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Date</div>
            <div className="mt-1">
              {project.entry_date ? new Date(project.entry_date).toLocaleDateString("en-AU") : "—"}
            </div>
            <div className="mt-2.5 text-[10px] uppercase tracking-wider text-gray-400">Site</div>
            <div className="mt-1 text-gray-500">
              {[project.lot_no && `Lot ${project.lot_no}`, project.address, project.suburb]
                .filter(Boolean)
                .join(", ") || "—"}
            </div>
          </div>
        </div>

        <table className="mt-9 w-full text-sm">
          <thead>
            <tr className="border-b border-black text-left text-[10px] uppercase tracking-wider text-gray-400">
              <th className="pb-2.5 font-semibold">Product</th>
              {project.show_qty_on_quote && <th className="pb-2.5 text-right font-semibold">Qty (m²)</th>}
              <th className="pb-2.5 text-right font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((l, i) => (
              <Fragment key={i}>
                <tr className="border-b border-gray-100">
                  <td className="py-3">{l.parts?.name || "—"}</td>
                  {project.show_qty_on_quote && <td className="py-3 text-right">{l.qty_m2} m²</td>}
                  <td className="py-3 text-right">{fmtCurrency(l.charge)}</td>
                </tr>
                {l.note && (
                  <tr className="border-b border-gray-100">
                    <td colSpan={project.show_qty_on_quote ? 3 : 2} className="pb-2.5 text-xs text-gray-400 italic">
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
          <div className="mt-3.5 text-xs text-gray-400 italic">{project.notes}</div>
        )}

        <div className="mt-7 flex justify-end">
          <div className="w-60">
            {/* Customer discount is folded into the subtotal below but not itemized here —
                it's commercial info the customer doesn't need to see broken out. */}
            <div className="flex justify-between py-1 text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between py-1 text-sm text-gray-500">
              <span>GST (10%)</span>
              <span>{fmtCurrency(gst)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t-2 border-black pt-2.5">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-xl font-bold text-[#b8860f]">{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-between text-[10px] text-gray-300">
          <span>Better Batt Insulation</span>
          <span>Thank you for the opportunity to quote.</span>
        </div>
      </div>
    </div>
  );
}
