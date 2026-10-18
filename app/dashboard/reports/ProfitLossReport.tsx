"use client";

import { lineRate } from "@/lib/woRate";
import Link from "next/link";
import { useMemo, useState } from "react";
import { quoteTotals } from "@/lib/quoteTotals";

type Part = {
  coverage_m2: number;
  pack_cost_ex_gst: number;
  installer_rate_per_m2: number;
  supply_charge_per_pack: number;
  price_retail?: number | null;
  price_trade?: number | null;
  price_regency?: number | null;
  supply_install_rate_per_m2: number;
} | null;

export type PlProject = {
  id: string;
  quote_number: number;
  job_type: string;
  outcome: string;
  entry_date: string;
  quote_markup: number;
  price_tier?: string | null;
  archived: boolean;
  address?: string | null;
  suburb?: string | null;
  customers: { name: string; discount_pct: number } | null;
};
export type PlProjectLine = { project_id: string; qty_m2: number; parts: Part };
export type PlWorkOrder = { id: string; project_id: string | null; archived: boolean };
export type PlWoLine = {
  work_order_id: string;
  qty: number | null;
  labour_item_id: string | null;
  rate?: number | null;
  part_id: string | null;
  picked: boolean | null;
  multi_picked: number | null;
  packs_picked: number | null;
  multi_returned: number | null;
  packs_returned: number | null;
  parts: { coverage_m2: number; pack_cost_ex_gst: number; pack_per_multi: number; installer_rate_per_m2?: number } | null;
};
export type PlLabour = { id: string; contractor_rate: number };
export type PlInvoice = {
  id: string;
  project_id: string | null;
  customer_id: string | null;
  kind: string;
  amount_ex_gst: number;
  total: number;
  status: string;
  invoice_date: string;
  customers: { name: string } | null;
};
export type PlPayment = { invoice_id: string; amount: number };

type Preset = "month" | "quarter" | "year" | "all" | "custom";
type Basis = "quoted" | "invoiced";

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeFor(p: Preset, cs: string, ce: string): [string | null, string | null] {
  const now = new Date();
  const y = now.getFullYear();
  if (p === "all") return [null, null];
  if (p === "custom") return [cs || null, ce || null];
  if (p === "month") return [ymd(new Date(y, now.getMonth(), 1)), ymd(new Date(y, now.getMonth() + 1, 0))];
  if (p === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return [ymd(new Date(y, q * 3, 1)), ymd(new Date(y, q * 3 + 3, 0))];
  }
  return [ymd(new Date(y, 0, 1)), ymd(new Date(y, 11, 31))];
}
const inRange = (d: string | null, s: string | null, e: string | null) => !!d && (!s || d >= s) && (!e || d <= e);

type JobRow = {
  p: PlProject;
  customer: string;
  site: string;
  quoted: number;
  invoicedEx: number;
  invoicedInc: number;
  paid: number;
  materials: number;
  contractors: number;
  actual: boolean;
};

export default function ProfitLossReport({
  projects,
  projectLines,
  workOrders,
  woLines,
  labourItems,
  invoices,
  payments,
  invoicesAvailable,
}: {
  projects: PlProject[];
  projectLines: PlProjectLine[];
  workOrders: PlWorkOrder[];
  woLines: PlWoLine[];
  labourItems: PlLabour[];
  invoices: PlInvoice[];
  payments: PlPayment[];
  invoicesAvailable: boolean;
}) {
  const [preset, setPreset] = useState<Preset>("year");
  const [cs, setCs] = useState("");
  const [ce, setCe] = useState("");
  const [basis, setBasis] = useState<Basis>("quoted");
  const [search, setSearch] = useState("");
  const [start, end] = rangeFor(preset, cs, ce);

  const { jobs, counterSales } = useMemo(() => {
    const rate = new Map(labourItems.map((l) => [l.id, Number(l.contractor_rate) || 0]));
    const linesByProject = new Map<string, PlProjectLine[]>();
    projectLines.forEach((l) => linesByProject.set(l.project_id, [...(linesByProject.get(l.project_id) ?? []), l]));
    const wosByProject = new Map<string, string[]>();
    workOrders.filter((w) => !w.archived && w.project_id).forEach((w) => wosByProject.set(w.project_id!, [...(wosByProject.get(w.project_id!) ?? []), w.id]));
    const woLinesByWo = new Map<string, PlWoLine[]>();
    woLines.forEach((l) => woLinesByWo.set(l.work_order_id, [...(woLinesByWo.get(l.work_order_id) ?? []), l]));
    const invByProject = new Map<string, PlInvoice[]>();
    invoices.filter((i) => i.status !== "Void" && i.project_id).forEach((i) => invByProject.set(i.project_id!, [...(invByProject.get(i.project_id!) ?? []), i]));
    const paidByInv = new Map<string, number>();
    payments.forEach((p) => paidByInv.set(p.invoice_id, (paidByInv.get(p.invoice_id) ?? 0) + (Number(p.amount) || 0)));

    const out: JobRow[] = [];
    for (const p of projects) {
      if (p.archived || p.outcome !== "Accepted") continue;
      if (!inRange(p.entry_date, start, end)) continue;
      const pl = linesByProject.get(p.id) ?? [];
      const quoted = quoteTotals(p as any, pl as any).ex;

      // Materials and contractor cost: actual from work orders / picking slips when they exist, otherwise the quote's own estimate
      const woIds = wosByProject.get(p.id) ?? [];
      const wl = woIds.flatMap((id) => woLinesByWo.get(id) ?? []);
      const isSupplyOnly = p.job_type === "SUPPLY ONLY";
      let materials = 0;
      let contractors = 0;
      let actual = false;
      if (wl.length) {
        actual = true;
        for (const l of wl) {
          contractors +=
            (Number(l.qty) || 0) *
            lineRate(l.rate, l.labour_item_id ? rate.get(l.labour_item_id) : null, l.parts?.installer_rate_per_m2);
          if (!l.parts) continue;
          const cost = Number(l.parts.pack_cost_ex_gst) || 0;
          if (l.picked) {
            const ppm = Number(l.parts.pack_per_multi) || 0;
            const picked = (Number(l.multi_picked) || 0) * ppm + (Number(l.packs_picked) || 0);
            const back = (Number(l.multi_returned) || 0) * ppm + (Number(l.packs_returned) || 0);
            materials += (picked - back) * cost;
          } else if (l.parts.coverage_m2 > 0 && l.part_id) {
            materials += Math.ceil((Number(l.qty) || 0) / l.parts.coverage_m2 - 1e-9) * cost;
          }
        }
      } else {
        for (const l of pl) {
          if (!l.parts) continue;
          const q = Number(l.qty_m2) || 0;
          const packs = l.parts.coverage_m2 > 0 ? Math.ceil(q / l.parts.coverage_m2) : 0;
          materials += packs * l.parts.pack_cost_ex_gst;
          if (!isSupplyOnly) contractors += q * l.parts.installer_rate_per_m2;
        }
      }

      const inv = invByProject.get(p.id) ?? [];
      out.push({
        p,
        customer: p.customers?.name ?? "No customer",
        site: [p.address, p.suburb].filter(Boolean).join(", "),
        quoted,
        invoicedEx: inv.reduce((s, i) => s + (Number(i.amount_ex_gst) || 0), 0),
        invoicedInc: inv.reduce((s, i) => s + (Number(i.total) || 0), 0),
        paid: inv.reduce((s, i) => s + (paidByInv.get(i.id) ?? 0), 0),
        materials,
        contractors,
        actual,
      });
    }
    out.sort((a, b) => b.p.quote_number - a.p.quote_number);

    const counter = invoices
      .filter((i) => i.status !== "Void" && !i.project_id && i.kind === "Items" && inRange(i.invoice_date, start, end))
      .reduce((s, i) => s + (Number(i.amount_ex_gst) || 0), 0);
    return { jobs: out, counterSales: counter };
  }, [projects, projectLines, workOrders, woLines, labourItems, invoices, payments, start, end]);

  const rev = (j: JobRow) => (basis === "quoted" ? j.quoted : j.invoicedEx);
  const profit = (j: JobRow) => rev(j) - j.materials - j.contractors;

  const visible = jobs.filter((j) => {
    const q = search.trim().toLowerCase();
    return !q || `q${j.p.quote_number} ${j.customer} ${j.site}`.toLowerCase().includes(q);
  });

  const sum = (f: (j: JobRow) => number) => visible.reduce((s, j) => s + f(j), 0);
  const tRev = sum(rev);
  const tMat = sum((j) => j.materials);
  const tCon = sum((j) => j.contractors);
  const tProfit = tRev - tMat - tCon;
  const tInv = sum((j) => j.invoicedInc);
  const tPaid = sum((j) => j.paid);
  const margin = tRev > 0 ? (tProfit / tRev) * 100 : null;

  const customers = useMemo(() => {
    const m = new Map<string, { name: string; jobs: number; rev: number; cost: number; invoiced: number; paid: number }>();
    for (const j of visible) {
      const r = m.get(j.customer) ?? { name: j.customer, jobs: 0, rev: 0, cost: 0, invoiced: 0, paid: 0 };
      r.jobs += 1;
      r.rev += rev(j);
      r.cost += j.materials + j.contractors;
      r.invoiced += j.invoicedInc;
      r.paid += j.paid;
      m.set(j.customer, r);
    }
    return Array.from(m.values()).sort((a, b) => b.rev - a.rev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, basis]);

  function exportCsv() {
    const head = ["Quote", "Customer", "Site", "Quoted ex GST", "Invoiced ex GST", "Paid inc GST", "Materials", "Contractors", "Profit", "Margin %", "Cost basis"];
    const body = visible.map((j) => [
      `Q${j.p.quote_number}`, j.customer, j.site, j.quoted.toFixed(2), j.invoicedEx.toFixed(2), j.paid.toFixed(2),
      j.materials.toFixed(2), j.contractors.toFixed(2), profit(j).toFixed(2),
      rev(j) > 0 ? ((profit(j) / rev(j)) * 100).toFixed(1) : "", j.actual ? "Actual" : "Estimate",
    ]);
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-and-loss-${ymd(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const btn = (active: boolean) => `rounded-md px-3 py-1 text-sm ${active ? "bg-[#201f1c] text-white" : "text-[var(--muted)]"}`;
  const tone = (n: number) => (n < 0 ? "text-[#b91c1c]" : "text-[#1f6b35]");

  return (
    <div className="mt-6 space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Profit and loss for accepted quotes (jobs), by quote date. All figures are ex GST unless marked. Materials use the real picking-slip cost once stock has
        been picked, and the quote estimate until then; contractor cost comes from the work order task lines.
      </p>
      {!invoicesAvailable && (
        <p className="rounded-lg border border-[#f3d48a] bg-[#fff4d6] px-3 py-2 text-sm text-[#7a5a0f]">
          Invoice figures are not available to your login, so invoiced and paid show as zero.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
          {([["month", "This month"], ["quarter", "This quarter"], ["year", "This year"], ["all", "All time"], ["custom", "Custom"]] as [Preset, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} className={btn(preset === k)}>{l}</button>
          ))}
        </div>
        {preset === "custom" && (
          <>
            <input type="date" value={cs} onChange={(e) => setCs(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm" />
            <input type="date" value={ce} onChange={(e) => setCe(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm" />
          </>
        )}
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
          <button onClick={() => setBasis("quoted")} className={btn(basis === "quoted")}>Sales = quoted</button>
          <button onClick={() => setBasis("invoiced")} className={btn(basis === "invoiced")}>Sales = invoiced</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quote #, customer, site..." className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" />
        <button onClick={exportCsv} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Tile label={basis === "quoted" ? "Sales (quoted)" : "Sales (invoiced)"} value={money(tRev)} />
        <Tile label="Materials" value={money(tMat)} />
        <Tile label="Contractors" value={money(tCon)} />
        <Tile label="Profit" value={money(tProfit)} cls={tone(tProfit)} />
        <Tile label="Margin" value={pct(margin)} cls={margin !== null ? tone(margin) : ""} />
        <Tile label="Invoiced inc GST" value={money(tInv)} />
        <Tile label="Paid / outstanding" value={`${money(tPaid)} / ${money(tInv - tPaid)}`} small />
      </div>
      {counterSales > 0 && (
        <p className="text-sm text-[var(--muted)]">
          Counter / item sales invoiced in this period: <b>{money(counterSales)}</b> ex GST. They have no job costing so they are not in the profit figures above.
        </p>
      )}

      <h2 className="text-lg font-bold">By job</h2>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Quote</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2 text-right">Quoted</th>
              <th className="px-3 py-2 text-right">Invoiced</th>
              <th className="px-3 py-2 text-right">Paid (inc)</th>
              <th className="px-3 py-2 text-right">Materials</th>
              <th className="px-3 py-2 text-right">Contractors</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2">Cost basis</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-[var(--muted)]">No accepted jobs in this period.</td></tr>
            )}
            {visible.map((j) => {
              const pr = profit(j);
              return (
                <tr key={j.p.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium"><Link href={`/dashboard/quotes/${j.p.id}`} className="text-accent hover:underline">Q{j.p.quote_number}</Link></td>
                  <td className="px-3 py-2">{j.customer}</td>
                  <td className="px-3 py-2">{j.site || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(j.quoted)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(j.invoicedEx)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(j.paid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(j.materials)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(j.contractors)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${tone(pr)}`}>{money(pr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(rev(j) > 0 ? (pr / rev(j)) * 100 : null)}</td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{j.actual ? "Work order / picking" : "Quote estimate"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-bold">By customer</h2>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Jobs</th>
              <th className="px-3 py-2 text-right">Sales</th>
              <th className="px-3 py-2 text-right">Costs</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">Invoiced (inc)</th>
              <th className="px-3 py-2 text-right">Paid (inc)</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const pr = c.rev - c.cost;
              return (
                <tr key={c.name} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.jobs}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(c.rev)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(c.cost)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${tone(pr)}`}>{money(pr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(c.rev > 0 ? (pr / c.rev) * 100 : null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(c.invoiced)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(c.paid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Profit = sales minus materials minus contractor pay. It does not include overheads, wages or fuel. Void invoices are left out.
      </p>
    </div>
  );
}

function Tile({ label, value, cls = "", small = false }: { label: string; value: string; cls?: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className={`mt-1 font-bold tabular-nums ${small ? "text-base" : "text-xl"} ${cls}`}>{value}</p>
    </div>
  );
}
