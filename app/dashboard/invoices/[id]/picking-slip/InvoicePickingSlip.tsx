"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { elementToPdf, pdfFileName } from "@/lib/elementToPdf";
import { fmtSplit } from "@/lib/picking";
import { fmtDate, invNo } from "@/lib/invoices";

type Line = {
  id: string;
  description: string;
  qty: number;
  part_id: string | null;
  picked: boolean;
  multi_picked: number | null;
  packs_picked: number | null;
  parts: { id: string; name: string; code: string | null; pack_per_multi: number; stock_on_hand: number } | null;
};

export default function InvoicePickingSlip({ invoice, lines: initial }: { invoice: any; lines: Line[] }) {
  const supabase = createClient();
  const [lines, setLines] = useState<Line[]>(initial);
  const [entry, setEntry] = useState<Record<string, { multi: string; pks: string }>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);

  const proj = invoice.projects;
  const site =
    invoice.delivery_address || invoice.site_address || [proj?.lot_no ? (/^lot\b/i.test(proj.lot_no) ? proj.lot_no : `Lot ${proj.lot_no}`) : null, proj?.address, proj?.suburb].filter(Boolean).join(", ") || "";
  const method = invoice.delivery_method === "pickup" ? "Customer pick-up" : "Delivery";
  const field = "w-16 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm text-black";

  async function pick(l: Line) {
    const e = entry[l.id] ?? { multi: "", pks: String(l.qty) };
    const multi = Number(e.multi) || 0;
    const pks = Number(e.pks) || 0;
    if (multi <= 0 && pks <= 0) return setMsg({ ok: false, text: "Enter how many multis and/or loose packs you picked." });
    setBusy(l.id);
    const { error } = await supabase.rpc("pick_invoice_line", { p_line_id: l.id, p_multi: multi, p_pks: pks });
    setBusy("");
    if (error) return setMsg({ ok: false, text: error.message + " (has migration 0053 been run?)" });
    setLines(lines.map((x) => (x.id === l.id ? { ...x, picked: true, multi_picked: multi, packs_picked: pks } : x)));
    setMsg({ ok: true, text: "Picked. Stock taken off inventory." });
  }

  async function undo(l: Line) {
    setBusy(l.id);
    const { error } = await supabase.rpc("unpick_invoice_line", { p_line_id: l.id });
    setBusy("");
    if (error) return setMsg({ ok: false, text: error.message });
    setLines(lines.map((x) => (x.id === l.id ? { ...x, picked: false, multi_picked: null, packs_picked: null } : x)));
    setMsg({ ok: true, text: "Pick undone. Stock put back." });
  }

  async function downloadPdf() {
    if (!printableRef.current) return;
    setDownloading(true);
    try {
      await elementToPdf(printableRef.current, pdfFileName(`Picking slip ${invNo(invoice.invoice_number)}`, invoice.customers?.name), "landscape");
    } catch {
      setMsg({ ok: false, text: "Couldn't make the PDF. Try again." });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/dashboard/invoices/${invoice.id}`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          &larr; Back to invoice
        </Link>
        <button onClick={downloadPdf} disabled={downloading} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {downloading ? "Making PDF…" : "Download PDF"}
        </button>
        <button onClick={() => window.print()} className="hidden rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent md:block">
          Print
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>

      <div ref={printableRef} className="mx-auto max-w-5xl paper-sheet rounded-xl border border-[var(--border)] bg-white p-8 text-black print:border-none print:p-0">
        <div className="flex items-center justify-between rounded-xl bg-[#141413] px-6 py-5 text-white">
          <div>
            <div className="text-3xl font-bold">Better Batt Insulation</div>
            <div className="text-lg font-semibold tracking-wide text-gray-300">Picking Slip</div>
          </div>
          <div className="text-right">
            <div className="text-sm uppercase tracking-wide text-gray-300">Invoice</div>
            <div className="text-4xl font-bold">{invNo(invoice.invoice_number)}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">Customer</div>
            <div className="mt-0.5 text-base font-semibold">{invoice.customers?.name || "—"}</div>
            {invoice.customers?.contact_name && <div className="text-gray-700">{invoice.customers.contact_name}</div>}
            {(invoice.customers?.contact_phone || invoice.projects?.contact_phone) && (
              <div className="font-semibold">{invoice.customers?.contact_phone || invoice.projects?.contact_phone}</div>
            )}
            {invoice.customers?.contact_email && <div className="break-all text-xs text-gray-500">{invoice.customers.contact_email}</div>}
            {invoice.customer_po && <div className="mt-1 text-xs text-gray-500">Customer PO: {invoice.customer_po}</div>}
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">{invoice.delivery_method === "pickup" ? "Site" : "Deliver to"}</div>
            <div className="mt-0.5 whitespace-pre-wrap text-base font-semibold">{site || "—"}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">Site contact</div>
            {invoice.delivery_contact_name || invoice.delivery_contact_phone ? (
              <div>
                {invoice.delivery_contact_name && <span className="font-semibold">{invoice.delivery_contact_name}</span>}
                {invoice.delivery_contact_phone && <span className="ml-2 font-semibold">{invoice.delivery_contact_phone}</span>}
              </div>
            ) : (
              <div className="text-gray-500">Same as customer</div>
            )}
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">{method}</div>
            <div className="mt-0.5 text-base font-bold">{invoice.delivery_date ? fmtDate(invoice.delivery_date) : "Date not set"}</div>
            {invoice.delivery_time && <div className="font-semibold">{invoice.delivery_time}</div>}
            {invoice.delivery_note && <div className="mt-1 whitespace-pre-wrap text-gray-700">{invoice.delivery_note}</div>}
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <th className="rounded-l-lg px-2 py-1.5">Code</th>
              <th className="px-2 py-1.5">Product</th>
              <th className="px-2 py-1.5 text-right">Packs needed</th>
              <th className="px-2 py-1.5 text-right">System stock</th>
              <th className="rounded-r-lg px-2 py-1.5">Picked</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 align-middle">
                <td className="px-2 py-2 text-gray-500">{l.parts?.code || "—"}</td>
                <td className="px-2 py-2 font-medium">
                  {l.parts?.name || l.description}
                  {Number(l.parts?.pack_per_multi) > 1 && <span className="ml-1 font-normal text-gray-400">({l.parts!.pack_per_multi}/multi)</span>}
                </td>
                <td className="px-2 py-2 text-right font-semibold">
                  {Number(l.qty)} pack{Number(l.qty) === 1 ? "" : "s"}
                </td>
                <td className="px-2 py-2 text-right text-gray-600">{Number(l.parts?.stock_on_hand ?? 0)}</td>
                <td className="px-2 py-2">
                  {l.picked ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="font-semibold text-green-700">✓ {fmtSplit(Number(l.multi_picked) || 0, Number(l.packs_picked) || 0)}</span>
                      <button onClick={() => undo(l)} disabled={busy === l.id} className="text-xs text-red-700 underline print:hidden">Undo</button>
                    </span>
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-1 print:hidden">
                      <span className="text-xs text-gray-500">Multi</span>
                      <input className={field} inputMode="decimal" value={entry[l.id]?.multi ?? ""} onChange={(e) => setEntry({ ...entry, [l.id]: { multi: e.target.value, pks: entry[l.id]?.pks ?? String(l.qty) } })} />
                      <span className="text-xs text-gray-500">Pks</span>
                      <input className={field} inputMode="decimal" value={entry[l.id]?.pks ?? String(l.qty)} onChange={(e) => setEntry({ ...entry, [l.id]: { multi: entry[l.id]?.multi ?? "", pks: e.target.value } })} />
                      <button onClick={() => pick(l)} disabled={busy === l.id} className="rounded bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-60">Mark picked</button>
                    </span>
                  )}
                  {!l.picked && <span className="hidden whitespace-nowrap text-gray-400 print:inline">Multi: ______ &nbsp; Pks: ______</span>}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-400">
                  No warehouse items on this invoice. Set a line to &quot;Warehouse&quot; on the invoice to see it here.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-6 flex justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
          <span>Better Batt Insulation · printed {new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}</span>
          <span>Picked by: _______________________ &nbsp;&nbsp; Received by: _______________________ &nbsp;&nbsp; Date: ____________</span>
        </div>
      </div>
    </div>
  );
}
