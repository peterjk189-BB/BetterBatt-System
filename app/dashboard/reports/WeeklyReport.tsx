"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { elementToPdf } from "@/lib/elementToPdf";
import { quoteTotals } from "@/lib/quoteTotals";
import { siteAddress } from "@/lib/siteAddress";
import type { JobRow, JobInspection } from "./JobsSwmsReport";

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(s + "T00:00:00");
const short = (s: string | null | undefined) =>
  s ? parse(s).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : "—";
const long = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function mondayOf(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

type QuoteProject = {
  id: string;
  quote_number: number;
  job_type: string;
  outcome: string;
  entry_date: string;
  quote_markup: number;
  price_tier?: string | null;
  address?: string | null;
  suburb?: string | null;
  archived: boolean;
  customers: { name: string; discount_pct: number } | null;
};
type QuoteLine = { project_id: string; qty_m2: number; parts: any };

export default function WeeklyReport({
  workOrders,
  inspections,
  projects,
  projectLines,
}: {
  workOrders: JobRow[];
  inspections: JobInspection[];
  projects: QuoteProject[];
  projectLines: QuoteLine[];
}) {
  const supabase = createClient();
  const printRef = useRef<HTMLDivElement>(null);
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [invLines, setInvLines] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res: any = await supabase
        .from("invoice_lines")
        .select("invoice_id, part_id, description, qty, line_ex, invoices(invoice_number, invoice_date, status, project_id, customers(name))");
      if (res.error) setError(res.error.message);
      else setInvLines(res.data ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = iso(monday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const end = iso(sunday);
  const inWeek = (d: string | null | undefined) => !!d && d >= start && d <= end;
  const thisMonday = iso(mondayOf(new Date()));
  const shift = (days: number) => setMonday(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + days));

  // 1. Jobs completed
  const jobs = useMemo(() => {
    const insByWo = new Map<string, JobInspection[]>();
    for (const i of inspections) {
      if (i.archived) continue;
      if (!insByWo.has(i.work_order_id)) insByWo.set(i.work_order_id, []);
      insByWo.get(i.work_order_id)!.push(i);
    }
    const valueByProject = quoteValueByProject(projects, projectLines);
    return workOrders
      .filter((w) => !w.archived && inWeek(w.completed_date))
      .sort((a, b) => (a.completed_date! < b.completed_date! ? -1 : 1))
      .map((w) => {
        const list = insByWo.get(w.id) ?? [];
        const passed = list.some((i) => (i.result || "").toLowerCase().includes("pass"));
        return {
          id: w.id,
          wo: w.wo_number,
          customer: w.projects?.customers?.name || "—",
          site: [w.projects?.address, w.projects?.suburb].filter(Boolean).join(", ") || "—",
          contractor: w.subcontractors?.name || "—",
          date: w.completed_date,
          inspection: passed ? "Passed" : list.length ? "Not passed yet" : "No inspection",
          value: w.projects ? valueByProject.get((w as any).project_id) ?? 0 : 0,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrders, inspections, projects, projectLines, start]);

  // 2. Cash sales: inventory items on an invoice, to anyone, minus deliveries to a job that has a work order.
  const cash = useMemo(() => {
    const woProjects = new Set(workOrders.filter((w) => !w.archived).map((w: any) => w.project_id).filter(Boolean));
    const byInv = new Map<string, { number: number; date: string; customer: string; items: string[]; ex: number; project: string | null }>();
    for (const l of invLines ?? []) {
      const inv = l.invoices;
      if (!inv || inv.status === "Void" || inv.status === "Draft") continue;
      if (!l.part_id || !inWeek(inv.invoice_date)) continue;
      const r = byInv.get(l.invoice_id) ?? { number: inv.invoice_number, date: inv.invoice_date, customer: inv.customers?.name || "Cash Sale", items: [], ex: 0, project: inv.project_id };
      r.items.push(`${(l.description || "Item").trim()} × ${Number(l.qty) || 0}`);
      r.ex += Number(l.line_ex) || 0;
      byInv.set(l.invoice_id, r);
    }
    const all = [...byInv.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    const kept = all.filter((r) => !(r.project && woProjects.has(r.project)));
    const left = all.filter((r) => r.project && woProjects.has(r.project));
    return { kept, left, leftEx: left.reduce((s, r) => s + r.ex, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invLines, workOrders, start]);

  // 3. Quotes created in the week (value ex GST).
  const quotes = useMemo(() => {
    const val = quoteValueByProject(projects, projectLines);
    return projects
      .filter((p) => !p.archived && inWeek(p.entry_date))
      .sort((a, b) => a.quote_number - b.quote_number)
      .map((p) => ({
        id: p.id,
        number: p.quote_number,
        customer: p.customers?.name || "—",
        site: siteAddress(p) || "—",
        outcome: p.outcome,
        ex: val.get(p.id) ?? 0,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, projectLines, start]);

  const jobsTotal = jobs.reduce((s, j) => s + j.value, 0);
  const cashEx = cash.kept.reduce((s, r) => s + r.ex, 0);
  const quotesEx = quotes.reduce((s, q) => s + q.ex, 0);
  const accepted = quotes.filter((q) => q.outcome === "Accepted");
  const acceptedEx = accepted.reduce((s, q) => s + q.ex, 0);

  async function exportPdf() {
    if (!printRef.current) return;
    setBusy(true);
    try {
      await elementToPdf(printRef.current, `weekly-report-${start}.pdf`, "landscape");
    } finally {
      setBusy(false);
    }
  }

  const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#6b6862]";
  const td = "border-t border-[#dedbd2] px-2 py-1.5 align-top";
  const tile = (label: string, value: string, sub: string) => (
    <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-[var(--muted)]">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => shift(-7)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" aria-label="Previous week">‹</button>
        <span className="min-w-[210px] text-center text-sm font-semibold">Mon {long(monday)} – Sun {long(sunday)}</span>
        <button onClick={() => shift(7)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" aria-label="Next week">›</button>
        <button onClick={() => setMonday(mondayOf(new Date()))} disabled={start === thisMonday} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50">This week</button>
        <button onClick={() => setMonday(new Date(mondayOf(new Date()).getTime() - 7 * 86400000))} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">Last week</button>
        <button onClick={exportPdf} disabled={busy || !invLines} className="ml-auto rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50">{busy ? "Making PDF…" : "Export PDF"}</button>
      </div>

      {error && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">Could not load invoices: {error}</p>}
      {!invLines && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      {invLines && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tile("Jobs completed", String(jobs.length), `${money(jobsTotal)} quoted ex GST`)}
            {tile("Cash sales", money(cashEx), `${cash.kept.length} invoices, ex GST`)}
            {tile("Quotes", String(quotes.length), `${money(quotesEx)} ex GST`)}
            {tile("Quotes accepted", String(accepted.length), money(acceptedEx) + " ex GST")}
          </div>

          <div ref={printRef} className="paper-sheet space-y-5 rounded-xl border border-[var(--border)] bg-white p-5 text-[13px] text-[#201f1c]">
            <div>
              <p className="text-lg font-bold">Better Batt Insulation — Weekly report</p>
              <p className="text-[#6b6862]">Mon {long(monday)} to Sun {long(sunday)}. All dollar figures exclude GST.</p>
            </div>

            <section>
              <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">1. Jobs completed</h3><span className="tabular-nums">{jobs.length} jobs · {money(jobsTotal)}</span></div>
              <p className="mb-1 text-xs text-[#6b6862]">Work orders with a completed date in the week.</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className={th}>WO</th><th className={th}>Customer</th><th className={th}>Site</th><th className={th}>Contractor</th><th className={th}>Completed</th><th className={th}>Inspection</th><th className={th + " text-right"}>Quote value</th></tr></thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id}><td className={td}>{j.wo}</td><td className={td}>{j.customer}</td><td className={td}>{j.site}</td><td className={td}>{j.contractor}</td><td className={td}>{short(j.date)}</td><td className={td}>{j.inspection}</td><td className={td + " text-right tabular-nums"}>{money(j.value)}</td></tr>
                    ))}
                    {!jobs.length && <tr><td className={td + " text-[#6b6862]"} colSpan={7}>No jobs completed this week.</td></tr>}
                  </tbody>
                  <tfoot><tr><td className={td + " font-bold"} colSpan={6}>Total</td><td className={td + " text-right font-bold tabular-nums"}>{money(jobsTotal)}</td></tr></tfoot>
                </table>
              </div>
            </section>

            <section>
              <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">2. Cash sales</h3><span className="tabular-nums">{cash.kept.length} sales · {money(cashEx)}</span></div>
              <p className="mb-1 text-xs text-[#6b6862]">Inventory items sold on invoices to anyone. Deliveries to job sites that have a work order are left out.</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className={th}>Invoice</th><th className={th}>Date</th><th className={th}>Customer</th><th className={th}>Items</th><th className={th + " text-right"}>Ex GST</th></tr></thead>
                  <tbody>
                    {cash.kept.map((r) => (
                      <tr key={r.number}><td className={td}>INV-{r.number}</td><td className={td}>{short(r.date)}</td><td className={td}>{r.customer}</td><td className={td}>{r.items.join("; ")}</td><td className={td + " text-right tabular-nums"}>{money(r.ex)}</td></tr>
                    ))}
                    {!cash.kept.length && <tr><td className={td + " text-[#6b6862]"} colSpan={5}>No cash sales this week.</td></tr>}
                  </tbody>
                  <tfoot><tr><td className={td + " font-bold"} colSpan={4}>Total</td><td className={td + " text-right font-bold tabular-nums"}>{money(cashEx)}</td></tr></tfoot>
                </table>
              </div>
              {cash.left.length > 0 && (
                <p className="mt-1 text-xs text-[#6b6862]">
                  {cash.left.length} invoice{cash.left.length === 1 ? "" : "s"} left out (deliveries to jobs with work orders): {cash.left.map((r) => `INV-${r.number}`).join(", ")}, {money(cash.leftEx)}.
                </p>
              )}
            </section>

            <section>
              <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">3. Quotes</h3><span className="tabular-nums">{quotes.length} quotes · {money(quotesEx)}</span></div>
              <p className="mb-1 text-xs text-[#6b6862]">Quotes created in the week, with their value ex GST.</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className={th}>Quote</th><th className={th}>Customer</th><th className={th}>Site</th><th className={th}>Outcome</th><th className={th + " text-right"}>Value ex GST</th></tr></thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id}><td className={td}>Q{q.number}</td><td className={td}>{q.customer}</td><td className={td}>{q.site}</td><td className={td}>{q.outcome}</td><td className={td + " text-right tabular-nums"}>{money(q.ex)}</td></tr>
                    ))}
                    {!quotes.length && <tr><td className={td + " text-[#6b6862]"} colSpan={5}>No quotes created this week.</td></tr>}
                  </tbody>
                  <tfoot><tr><td className={td + " font-bold"} colSpan={4}>Total</td><td className={td + " text-right font-bold tabular-nums"}>{money(quotesEx)}</td></tr></tfoot>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function quoteValueByProject(projects: QuoteProject[], lines: QuoteLine[]) {
  const by = new Map<string, QuoteLine[]>();
  for (const l of lines) {
    if (!by.has(l.project_id)) by.set(l.project_id, []);
    by.get(l.project_id)!.push(l);
  }
  const out = new Map<string, number>();
  for (const p of projects) out.set(p.id, quoteTotals(p as any, (by.get(p.id) ?? []) as any).ex);
  return out;
}
