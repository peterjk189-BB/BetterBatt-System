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

  // Delivery fee items still count toward the total (the customer is still paying for
  // it), but the quote shouldn't show its price broken out as its own line.
  const isDeliveryItem = (name: string | undefined) => /delivery/i.test(name || "");

  const computed = lines.map((l) => {
    const part = l.parts;
    if (!part) return { ...l, packs: 0, charge: 0, isDelivery: false };
    const packs = part.coverage_m2 > 0 ? Math.ceil(l.qty_m2 / part.coverage_m2) : 0;
    const usedForCal = packs * part.coverage_m2;
    const charge = isSupplyOnly ? packs * part.supply_charge_per_pack : usedForCal * part.supply_install_rate_per_m2;
    return { ...l, packs, charge, isDelivery: isDeliveryItem(part.name) };
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

      <style jsx global>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
      `}</style>

      <div
        ref={printableRef}
        className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-10 text-[#201f1c] print:border-none print:p-0"
      >
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#141413] px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center rounded-lg bg-white px-2.5 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Better Batt Insulation"
                className="h-9 w-auto object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div>
              <div className="text-xl font-extrabold text-white">Better Batt Insulation</div>
              <div className="mt-0.5 text-[11px] text-gray-300">Insulation supply &amp; install</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-gray-300">Quote</div>
            <div className="text-2xl font-extrabold text-white">Q{project.quote_number}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-[#f6f5f2] px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-wider text-[#8c887f]">Customer</div>
            <div className="mt-0.5 text-[13px] font-bold">{project.customers?.name || "—"}</div>
            {(project.contact_name || project.contact_phone) && (
              <div className="mt-0.5 text-xs text-[#6b6862]">
                {[project.contact_name, project.contact_phone].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-[#f6f5f2] px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-wider text-[#8c887f]">Date</div>
            <div className="mt-0.5 text-[13px] font-bold">
              {project.entry_date ? new Date(project.entry_date).toLocaleDateString("en-AU") : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-[#f6f5f2] px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-wider text-[#8c887f]">Site</div>
            <div className="mt-0.5 text-[13px] font-bold">
              {[project.lot_no && `Lot ${project.lot_no}`, project.address, project.suburb]
                .filter(Boolean)
                .join(", ") || "—"}
            </div>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="bg-[#f6f5f2] text-left text-[9px] uppercase tracking-wider text-[#8c887f]">
              <th className="rounded-l-lg px-2.5 py-2 font-semibold">Product</th>
              {project.show_qty_on_quote && <th className="px-2.5 py-2 text-right font-semibold">Qty (m²)</th>}
              <th className="rounded-r-lg px-2.5 py-2 text-right font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((l, i) => (
              <Fragment key={i}>
                <tr className={l.note ? "" : "border-b border-gray-300"}>
                  <td className="px-2.5 py-1.5">{l.parts?.name || "—"}</td>
                  {project.show_qty_on_quote && <td className="px-2.5 py-1.5 text-right">{l.qty_m2} m²</td>}
                  <td className="px-2.5 py-1.5 text-right font-medium">
                    {l.isDelivery ? "" : fmtCurrency(l.charge)}
                  </td>
                </tr>
                {l.note && (
                  <tr className="border-b border-gray-300">
                    <td
                      colSpan={project.show_qty_on_quote ? 3 : 2}
                      className="px-2.5 pb-1.5 text-xs italic text-[#6b6862]"
                    >
                      {l.note}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={project.show_qty_on_quote ? 3 : 2} className="py-6 text-center text-gray-500">
                  No line items.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {project.notes && (
          <div className="mt-4 rounded-lg bg-[#f6f5f2] px-3.5 py-2.5 text-xs text-[#6b6862]">{project.notes}</div>
        )}

        <div className="mt-4 flex justify-end">
          {/* Customer discount is folded into the subtotal below but not itemized here —
              it's commercial info the customer doesn't need to see broken out. */}
          <div className="w-64 rounded-lg bg-[#f6f5f2] p-3.5">
            <div className="flex justify-between py-0.5 text-sm text-[#6b6862]">
              <span>Subtotal</span>
              <span className="text-[#201f1c]">{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-sm text-[#6b6862]">
              <span>GST (10%)</span>
              <span className="text-[#201f1c]">{fmtCurrency(gst)}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t border-[#e4e1da] pt-2 text-base font-extrabold">
              <span>Total</span>
              <span>{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-between border-t border-gray-100 pt-3 text-[10px] text-[#9a968d]">
          <span>Better Batt Insulation</span>
          <span>Thank you for the opportunity to quote.</span>
        </div>
      </div>
    </div>
  );
}
