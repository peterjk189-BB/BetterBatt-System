"use client";

import { supplyPackPrice } from "@/lib/priceTiers";
import { Fragment, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { elementToPdf, pdfFileName } from "@/lib/elementToPdf";
import { optionTitle, usedOptionKeys } from "@/lib/quoteOptions";

type Line = {
  part_id: string | null;
  qty_m2: number;
  note: string | null;
  option_key?: string | null;
  parts: {
    name: string;
    coverage_m2: number;
    supply_charge_per_pack: number;
    price_retail?: number | null;
    price_trade?: number | null;
    price_regency?: number | null;
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
  price_tier?: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  option_titles?: Record<string, string> | null;
  option_accepted?: string[] | null;
  customers: { name: string; discount_pct: number | null } | null;
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function QuotePrintView({
  project,
  lines,
  termsAndConditions,
}: {
  project: Project;
  lines: Line[];
  termsAndConditions?: string;
}) {
  const printableRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  // Line prices are hidden by default: only Subtotal / GST / Total show. The button turns them on. Applies to Print and PDF.
  const [hidePrices, setHidePrices] = useState(true);

  // The browser's Print / Save as PDF uses the page title as the file name.
  useEffect(() => {
    const prev = document.title;
    document.title = pdfFileName(`Quote Q${project.quote_number}`, project.customers?.name, [project.address, project.suburb].filter(Boolean).join(", ")).replace(/\.pdf$/, "");
    return () => {
      document.title = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function downloadPdf() {
    if (!printableRef.current) return;
    setDownloading(true);
    try {
      await elementToPdf(printableRef.current, pdfFileName(`Quote Q${project.quote_number}`, project.customers?.name, [project.address, project.suburb].filter(Boolean).join(", ")), "portrait");
    } finally {
      setDownloading(false);
    }
  }

  const isSupplyOnly = project.job_type === "SUPPLY ONLY";
  const showPrices = !hidePrices;
  const colCount = 1 + (project.show_qty_on_quote ? 1 : 0) + (showPrices ? 1 : 0);

  // Delivery fee items still count toward the total (the customer is still paying for
  // it), but the quote shouldn't show its price broken out as its own line.
  const isDeliveryItem = (name: string | undefined) => /delivery/i.test(name || "");

  const computed = lines.map((l) => {
    const part = l.parts;
    if (!part) return { ...l, packs: 0, charge: 0, isDelivery: false };
    const packs = part.coverage_m2 > 0 ? Math.ceil(l.qty_m2 / part.coverage_m2) : 0;
    const usedForCal = packs * part.coverage_m2;
    const charge = isSupplyOnly ? packs * supplyPackPrice(part, project.price_tier) : usedForCal * part.supply_install_rate_per_m2;
    return { ...l, packs, charge, isDelivery: isDeliveryItem(part.name) };
  });

  const customerDiscountPct = project.customers?.discount_pct || 0;
  const mainComputed = computed.filter((l) => !l.option_key);
  const optionKeys = usedOptionKeys(lines, project.option_titles);
  const acceptedOpts = project.option_accepted ?? [];
  const optionData = optionKeys.map((k) => {
    const ls = computed.filter((l) => l.option_key === k);
    const sub = ls.reduce((a, l) => a + l.charge, 0) * (1 - customerDiscountPct / 100);
    return { key: k, lines: ls, sub, gst: sub * 0.1, total: sub * 1.1, accepted: acceptedOpts.includes(k) };
  });
  const chargeBeforeMarkup = mainComputed.reduce((s, l) => s + l.charge, 0);
  const customerDiscountTotal = chargeBeforeMarkup * (customerDiscountPct / 100);
  const subtotal = chargeBeforeMarkup - customerDiscountTotal + Number(project.quote_markup || 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;
  const acceptedOptSub = optionData.filter((o) => o.accepted).reduce((a, o) => a + o.sub, 0);
  const grandTotal = (subtotal + acceptedOptSub) * 1.1;

  const renderRows = (list: typeof computed) =>
    list.map((l, i) => (
      <Fragment key={i}>
        <tr className={`quote-row ${l.note ? "" : "border-b border-gray-300"}`}>
          <td className="px-2.5 py-1.5">{l.parts?.name || "—"}</td>
          {project.show_qty_on_quote && <td className="px-2.5 py-1.5 text-right">{l.isDelivery ? l.qty_m2 : `${l.qty_m2} m²`}</td>}
          {showPrices && (
            <td className="px-2.5 py-1.5 text-right font-medium">{l.isDelivery ? "" : fmtCurrency(l.charge)}</td>
          )}
        </tr>
        {l.note && (
          <tr className="quote-note border-b border-gray-300">
            <td colSpan={colCount} className="px-2.5 pb-1.5 text-xs italic text-[#6b6862]">
              {l.note}
            </td>
          </tr>
        )}
      </Fragment>
    ));

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
        <button
          onClick={() => setHidePrices((v) => !v)}
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            hidePrices ? "border-accent bg-blue-50 text-accent" : "border-[var(--border)] hover:border-accent"
          }`}
        >
          {hidePrices ? "Show line prices" : "Hide line prices"}
        </button>
        <span className="text-xs text-[var(--muted)]">
          Downloads a PDF file you can attach to an email in Outlook.
        </span>
      </div>

      <style jsx global>{`
        @media print {
          /* Zero page margin stops the browser stamping its own header/footer
             (page URL, date, page numbers) on the quote. The spacing comes from
             the padding on the quote itself instead. */
          @page {
            size: A4;
            margin: 0;
          }
          .quote-sheet {
            padding: 12mm 14mm !important;
            -webkit-box-decoration-break: clone;
            box-decoration-break: clone;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* Keep a line item, its note, the totals box and each terms
             paragraph from being sliced in half across a page break —
             the whole block moves to the next page instead. */
          .quote-row,
          .quote-note,
          .quote-totals,
          .quote-terms-block,
          .quote-terms-para {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div
        ref={printableRef}
        className="quote-sheet mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-10 text-[#201f1c] print:border-none print:p-0"
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
              <th className={`rounded-l-lg px-2.5 py-2 font-semibold ${colCount === 1 ? "rounded-r-lg" : ""}`}>Product</th>
              {project.show_qty_on_quote && <th className={`px-2.5 py-2 text-right font-semibold ${showPrices ? "" : "rounded-r-lg"}`}>Qty</th>}
              {showPrices && <th className="rounded-r-lg px-2.5 py-2 text-right font-semibold">Price</th>}
            </tr>
          </thead>
          <tbody>
            {renderRows(mainComputed)}
            {mainComputed.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-6 text-center text-gray-500">
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
          <div className="quote-totals w-64 rounded-lg bg-[#f6f5f2] p-3.5">
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

        {optionData.length > 0 && (
          <div className="mt-6">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8c887f]">
              Optional extras — not included in the total above
            </div>
            {optionData.map((o) => (
              <div key={o.key} className="quote-totals mt-3">
                <div className="flex items-center justify-between rounded-lg bg-[#f6f5f2] px-2.5 py-2 text-sm font-bold">
                  <span>{optionTitle(project.option_titles, o.key)}</span>
                  {o.accepted && <span className="text-xs font-semibold text-green-700">Accepted</span>}
                </div>
                <table className="w-full text-sm">
                  <tbody>{renderRows(o.lines)}</tbody>
                </table>
                <div className="mt-1.5 flex justify-end">
                  <div className="w-64 text-sm">
                    <div className="flex justify-between py-0.5 text-[#6b6862]">
                      <span>Subtotal</span>
                      <span className="text-[#201f1c]">{fmtCurrency(o.sub)}</span>
                    </div>
                    <div className="flex justify-between py-0.5 text-[#6b6862]">
                      <span>GST (10%)</span>
                      <span className="text-[#201f1c]">{fmtCurrency(o.gst)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#e4e1da] pt-1.5 font-extrabold">
                      <span>{`Option ${o.key} total`}</span>
                      <span>{fmtCurrency(o.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {acceptedOptSub > 0 && (
              <div className="quote-totals mt-3 flex justify-end">
                <div className="flex w-64 justify-between rounded-lg bg-[#f6f5f2] p-3.5 text-base font-extrabold">
                  <span>Total with accepted options</span>
                  <span>{fmtCurrency(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {termsAndConditions && termsAndConditions.trim() && (
          <div className="quote-terms-block mt-6 border-t border-gray-100 pt-4">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8c887f]">Terms &amp; Conditions</div>
            <div className="mt-2 space-y-1.5">
              {termsAndConditions
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p key={i} className="quote-terms-para text-[9.5px] leading-relaxed text-[#6b6862]">
                    {paragraph}
                  </p>
                ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between border-t border-gray-100 pt-3 text-[10px] text-[#9a968d]">
          <span>Better Batt Insulation</span>
          <span>Thank you for the opportunity to quote.</span>
        </div>
      </div>
    </div>
  );
}
