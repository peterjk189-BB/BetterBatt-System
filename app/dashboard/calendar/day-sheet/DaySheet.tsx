"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { elementToPdf, pdfFileName } from "@/lib/elementToPdf";

type Row = {
  id: string;
  qty: number | null;
  note: string | null;
  task_time: string | null;
  completed?: boolean | null;
  parts: { name: string; is_stock_item: boolean | null } | null;
  labour_items: { code: string | null; description: string | null } | null;
  contractor: { id: string; name: string; phone: string | null } | null;
  work_orders: {
    id: string;
    wo_number: string | number;
    notes: string | null;
    projects: {
      quote_number: number | null;
      lot_no: string | null;
      address: string | null;
      suburb: string | null;
      contact_name: string | null;
      contact_phone: string | null;
      customers: { name: string } | null;
    } | null;
  };
};

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m}${hour >= 12 ? "pm" : "am"}`;
}

function siteOf(p: Row["work_orders"]["projects"]) {
  if (!p) return "—";
  const lot = p.lot_no?.trim();
  return [lot ? (/^lot\b/i.test(lot) ? lot : `Lot ${lot}`) : null, p.address, p.suburb].filter(Boolean).join(", ") || "—";
}

export default function DaySheet({
  date,
  contractorId,
  contractors,
  rows,
}: {
  date: string;
  contractorId: string;
  contractors: { id: string; name: string }[];
  rows: Row[];
  allContractorsCount: number;
}) {
  const router = useRouter();
  const printableRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState("");

  const go = (d: string, c: string) => router.push(`/dashboard/calendar/day-sheet?date=${d}${c ? `&contractor_id=${c}` : ""}`);
  const shift = (days: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    go(iso, contractorId);
  };

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const contractorName = contractors.find((c) => c.id === contractorId)?.name;
  const stockRows = rows.filter((r) => r.parts?.is_stock_item !== false);
  const totalM2 = stockRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const jobs = new Set(rows.map((r) => r.work_orders.id)).size;

  // One block per work order and contractor: the customer, site, contact and contractor print once, with each product line beneath.
  const groups = (() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = `${r.work_orders.id}|${r.contractor?.id ?? ""}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    const t = (r: Row) => r.task_time || "99:99";
    return Array.from(map.values())
      .map((rs) => ({ rows: rs.slice().sort((a, b) => t(a).localeCompare(t(b))) }))
      .sort((a, b) => t(a.rows[0]).localeCompare(t(b.rows[0])) || String(a.rows[0].work_orders.wo_number).localeCompare(String(b.rows[0].work_orders.wo_number), undefined, { numeric: true }));
  })();

  async function downloadPdf() {
    if (!printableRef.current) return;
    setDownloading(true);
    setErr("");
    try {
      await elementToPdf(printableRef.current, pdfFileName(`Day sheet ${date}`, contractorName), "landscape");
    } catch {
      setErr("Couldn't make the PDF. Try again.");
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
            margin: 8mm;
          }
        }
      `}</style>

      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/dashboard/calendar" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          &larr; Calendar
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:border-accent" aria-label="Previous day">&larr;</button>
          <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value, contractorId)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" />
          <button onClick={() => shift(1)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:border-accent" aria-label="Next day">&rarr;</button>
        </div>
        <select value={contractorId} onChange={(e) => go(date, e.target.value)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
          <option value="">All contractors</option>
          {contractors.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button onClick={downloadPdf} disabled={downloading} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {downloading ? "Making PDF…" : "Download PDF"}
        </button>
        <button onClick={() => window.print()} className="hidden rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent md:block">
          Print
        </button>
        {err && <span className="text-sm text-red-700">{err}</span>}
      </div>

      <div ref={printableRef} className="mx-auto max-w-[1100px] paper-sheet rounded-xl border border-[var(--border)] bg-white p-6 text-black print:max-w-none print:border-none print:p-0">
        <div className="flex items-end justify-between rounded-lg bg-[#141413] px-5 py-3 text-white">
          <div>
            <div className="text-xl font-bold">Better Batt Insulation · Day sheet</div>
            <div className="text-sm text-gray-300">{contractorName ? `Contractor: ${contractorName}` : "All contractors"}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold">{dateLabel}</div>
            <div className="text-sm text-gray-300">
              {jobs} job{jobs === 1 ? "" : "s"} · {totalM2.toLocaleString("en-AU", { maximumFractionDigits: 1 })} m²
            </div>
          </div>
        </div>

        <table className="mt-3 w-full border-collapse text-[11px] leading-tight">
          <thead>
            <tr className="bg-gray-100 text-left text-[9px] uppercase tracking-wide text-gray-600">
              <th className="px-1.5 py-1">Time</th>
              <th className="px-1.5 py-1">WO</th>
              <th className="px-1.5 py-1">Customer / site</th>
              <th className="px-1.5 py-1">Site contact</th>
              {!contractorId && <th className="px-1.5 py-1">Contractor</th>}
              <th className="px-1.5 py-1">Task / product</th>
              <th className="px-1.5 py-1 text-right">m²</th>
              <th className="px-1.5 py-1">Notes</th>
              <th className="px-1.5 py-1 text-center">Done</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              g.rows.map((r, i) => {
                const p = r.work_orders.projects;
                const task = r.labour_items?.description || r.parts?.name || "—";
                const notes = [r.note, i === 0 ? r.work_orders.notes : null].filter(Boolean).join(" · ");
                const span = g.rows.length;
                const first = i === 0;
                const last = i === span - 1;
                return (
                  <tr key={r.id} className={`break-inside-avoid align-top ${last ? "border-b border-gray-400" : "border-b border-gray-200"}`}>
                    <td className="whitespace-nowrap px-1.5 py-1 font-semibold">{fmtTime(r.task_time) || "—"}</td>
                    {first && (
                      <>
                        <td rowSpan={span} className="whitespace-nowrap border-l border-gray-200 px-1.5 py-1 font-semibold">{r.work_orders.wo_number}</td>
                        <td rowSpan={span} className="px-1.5 py-1">
                          <div className="font-semibold">{p?.customers?.name || "—"}</div>
                          <div className="text-gray-700">{siteOf(p)}</div>
                        </td>
                        <td rowSpan={span} className="px-1.5 py-1">
                          {p?.contact_name || p?.contact_phone ? (
                            <>
                              <div>{p?.contact_name}</div>
                              <div className="font-semibold">{p?.contact_phone}</div>
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        {!contractorId && (
                          <td rowSpan={span} className="px-1.5 py-1">
                            <div>{r.contractor?.name || "—"}</div>
                            {r.contractor?.phone && <div className="text-gray-600">{r.contractor.phone}</div>}
                          </td>
                        )}
                      </>
                    )}
                    <td className="border-l border-gray-200 px-1.5 py-1">{task}</td>
                    <td className="whitespace-nowrap px-1.5 py-1 text-right font-semibold">{r.parts?.is_stock_item === false ? "" : Number(r.qty) || ""}</td>
                    <td className="px-1.5 py-1 text-gray-700">{notes}</td>
                    <td className="px-1.5 py-1 text-center">{r.completed ? "✓" : "☐"}</td>
                  </tr>
                );
              })
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={contractorId ? 8 : 9} className="py-8 text-center text-gray-400">
                  Nothing scheduled on this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-3 flex justify-between text-[10px] text-gray-400">
          <span>Printed {new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })} · m² excludes non-stock items</span>
          <span>Contractor pay not shown</span>
        </div>
      </div>
    </div>
  );
}
