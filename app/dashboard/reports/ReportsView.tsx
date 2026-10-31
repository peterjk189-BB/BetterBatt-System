"use client";

import ProfitLossReport, { type PlProject, type PlProjectLine, type PlWorkOrder, type PlWoLine, type PlLabour, type PlInvoice, type PlInvoiceLine, type PlPayment } from "./ProfitLossReport";
import ProductSalesReport from "./ProductSalesReport";
import WeeklyReport from "./WeeklyReport";
import JobsSwmsReport, { type JobRow, type JobSwms, type JobInspection, type JobLine } from "./JobsSwmsReport";
import { supplyPackPrice } from "@/lib/priceTiers";
import { fuelLevyAmount } from "@/lib/poFuel";
import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirroring the shapes the server page selects)
// ---------------------------------------------------------------------------

type Part = {
  id: string;
  code: string | null;
  name: string;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  pack_per_multi: number;
  stock_on_hand: number;
  archived: boolean;
};

type PoLine = {
  id: string;
  purchase_order_id: string;
  part_id: string | null;
  qty_pks: number;
  unit_cost: number | null;
  received_multi: number;
  received_pks: number;
  purchase_orders: {
    po_number: string | null;
    supplier_id: string | null;
    status: "Draft" | "Ordered" | "Received";
    order_date: string | null;
    delivery_date: string | null;
    archived: boolean;
    updated_at: string;
    suppliers: { name: string } | null;
  } | null;
};

type WoLine = {
  id: string;
  task_date: string | null;
  part_id: string | null;
  qty: number;
  work_orders: { archived: boolean } | null;
};

type Project = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  job_type: string;
  outcome: "Open" | "Accepted" | "Lost" | "Cancelled";
  entry_date: string;
  quote_markup: number;
  price_tier?: string | null;
  archived: boolean;
  customers: { name: string; discount_pct: number } | null;
};

type ProjectLine = {
  id: string;
  project_id: string;
  qty_m2: number;
  parts: {
    coverage_m2: number;
    pack_cost_ex_gst: number;
    installer_rate_per_m2: number;
    supply_charge_per_pack: number;
    price_retail?: number | null;
    price_trade?: number | null;
    price_regency?: number | null;
    supply_install_rate_per_m2: number;
  } | null;
};

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

type Preset = "month" | "quarter" | "year" | "all" | "custom";

function toDateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetRange(preset: Preset, customStart: string, customEnd: string): { start: string | null; end: string | null } {
  if (preset === "all") return { start: null, end: null };
  if (preset === "custom") return { start: customStart || null, end: customEnd || null };
  const now = new Date();
  const y = now.getFullYear();
  if (preset === "month") {
    return { start: toDateOnly(new Date(y, now.getMonth(), 1)), end: toDateOnly(new Date(y, now.getMonth() + 1, 0)) };
  }
  if (preset === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: toDateOnly(new Date(y, q * 3, 1)), end: toDateOnly(new Date(y, q * 3 + 3, 0)) };
  }
  return { start: toDateOnly(new Date(y, 0, 1)), end: toDateOnly(new Date(y, 11, 31)) };
}

function inRange(dateStr: string | null, start: string | null, end: string | null) {
  if (!dateStr) return false;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function fmtNumber(n: number) {
  return n.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

function DateFilter({
  preset,
  setPreset,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}: {
  preset: Preset;
  setPreset: (p: Preset) => void;
  customStart: string;
  setCustomStart: (s: string) => void;
  customEnd: string;
  setCustomEnd: (s: string) => void;
}) {
  const btn = (p: Preset, label: string) => (
    <button
      onClick={() => setPreset(p)}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        preset === p ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {btn("month", "This month")}
      {btn("quarter", "This quarter")}
      {btn("year", "This year")}
      {btn("all", "All time")}
      {btn("custom", "Custom range")}
      {preset === "custom" && (
        <span className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
          />
          <span className="text-[var(--muted)]">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
          />
        </span>
      )}
    </div>
  );
}

function useDateRange() {
  const [preset, setPreset] = useState<Preset>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = presetRange(preset, customStart, customEnd);
  return { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range };
}

// ---------------------------------------------------------------------------
// Inventory movement
// ---------------------------------------------------------------------------

function InventoryReport({ parts, poLines, woLines }: { parts: Part[]; poLines: PoLine[]; woLines: WoLine[] }) {
  const { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range } = useDateRange();

  const rows = useMemo(() => {
    const byPart = new Map<
      string,
      { part: Part; receivedPacks: number; receivedCost: number; usedM2: number }
    >();
    for (const p of parts) {
      if (p.archived) continue;
      byPart.set(p.id, { part: p, receivedPacks: 0, receivedCost: 0, usedM2: 0 });
    }

    for (const l of poLines) {
      const po = l.purchase_orders;
      if (!po || po.archived || po.status !== "Received") continue;
      if (!inRange(po.updated_at ? po.updated_at.slice(0, 10) : null, range.start, range.end)) continue;
      if (!l.part_id) continue;
      const row = byPart.get(l.part_id);
      if (!row) continue;
      const packs = (Number(l.received_multi) || 0) * (row.part.pack_per_multi || 0) + (Number(l.received_pks) || 0);
      row.receivedPacks += packs;
      row.receivedCost += packs * (Number(l.unit_cost) || 0);
    }

    for (const l of woLines) {
      if (!l.work_orders || l.work_orders.archived) continue;
      if (!inRange(l.task_date, range.start, range.end)) continue;
      if (!l.part_id) continue;
      const row = byPart.get(l.part_id);
      if (!row) continue;
      row.usedM2 += Number(l.qty) || 0;
    }

    return Array.from(byPart.values())
      .filter((r) => r.receivedPacks !== 0 || r.usedM2 !== 0)
      .sort((a, b) => a.part.name.localeCompare(b.part.name));
  }, [parts, poLines, woLines, range.start, range.end]);

  const totalReceivedCost = rows.reduce((s, r) => s + r.receivedCost, 0);
  const totalUsed = rows.reduce((s, r) => s + r.usedM2, 0);

  return (
    <div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Stock received (from purchase orders marked Received) versus material used on work orders, by part.
      </p>
      <div className="mt-4">
        <DateFilter
          preset={preset}
          setPreset={setPreset}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <div className="rounded-xl border border-[var(--border)] px-4 py-3">
          <div className="text-xs uppercase text-[var(--muted)]">Received (cost ex GST)</div>
          <div className="text-xl font-semibold">{fmtCurrency(totalReceivedCost)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] px-4 py-3">
          <div className="text-xs uppercase text-[var(--muted)]">Used on jobs (m²)</div>
          <div className="text-xl font-semibold">{fmtNumber(totalUsed)}</div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Part</th>
              <th className="px-3 py-2 text-right">Received (packs)</th>
              <th className="px-3 py-2 text-right">Received cost</th>
              <th className="px-3 py-2 text-right">Used (m²)</th>
              <th className="px-3 py-2 text-right">Current stock on hand</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.part.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">
                  {r.part.code ? `${r.part.code} — ` : ""}
                  {r.part.name}
                </td>
                <td className="px-3 py-2 text-right">{fmtNumber(r.receivedPacks)}</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(r.receivedCost)}</td>
                <td className="px-3 py-2 text-right">{fmtNumber(r.usedM2)}</td>
                <td className="px-3 py-2 text-right text-[var(--muted)]">{fmtNumber(r.part.stock_on_hand)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                  No stock movement in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer activity
// ---------------------------------------------------------------------------

function computeProjectValue(project: Project, lines: ProjectLine[]) {
  const isSupplyOnly = project.job_type === "SUPPLY ONLY";
  const discountPct = project.customers?.discount_pct || 0;
  const chargeBeforeMarkup = lines.reduce((s, l) => {
    const part = l.parts;
    if (!part) return s;
    const q = Number(l.qty_m2) || 0;
    const packs = part.coverage_m2 > 0 ? Math.ceil(q / part.coverage_m2) : 0;
    const usedForCal = packs * part.coverage_m2;
    const gross = isSupplyOnly ? packs * supplyPackPrice(part, project.price_tier) : usedForCal * part.supply_install_rate_per_m2;
    return s + gross;
  }, 0);
  const discountTotal = chargeBeforeMarkup * (discountPct / 100);
  const subtotal = chargeBeforeMarkup - discountTotal + (Number(project.quote_markup) || 0);
  return subtotal + subtotal * 0.1;
}

function CustomerReport({ projects, projectLines }: { projects: Project[]; projectLines: ProjectLine[] }) {
  const { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range } = useDateRange();

  const linesByProject = useMemo(() => {
    const m = new Map<string, ProjectLine[]>();
    for (const l of projectLines) {
      if (!m.has(l.project_id)) m.set(l.project_id, []);
      m.get(l.project_id)!.push(l);
    }
    return m;
  }, [projectLines]);

  const rows = useMemo(() => {
    const byCustomer = new Map<
      string,
      { name: string; quotes: number; accepted: number; lost: number; open: number; totalValue: number; acceptedValue: number }
    >();
    for (const p of projects) {
      if (p.archived) continue;
      if (!inRange(p.entry_date, range.start, range.end)) continue;
      const name = p.customers?.name || "No customer";
      if (!byCustomer.has(name)) {
        byCustomer.set(name, { name, quotes: 0, accepted: 0, lost: 0, open: 0, totalValue: 0, acceptedValue: 0 });
      }
      const row = byCustomer.get(name)!;
      const value = computeProjectValue(p, linesByProject.get(p.id) || []);
      row.quotes += 1;
      row.totalValue += value;
      if (p.outcome === "Accepted") {
        row.accepted += 1;
        row.acceptedValue += value;
      } else if (p.outcome === "Lost") {
        row.lost += 1;
      } else if (p.outcome === "Open") {
        row.open += 1;
      }
    }
    return Array.from(byCustomer.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, [projects, linesByProject, range.start, range.end]);

  const totalQuotes = rows.reduce((s, r) => s + r.quotes, 0);
  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);
  const totalAcceptedValue = rows.reduce((s, r) => s + r.acceptedValue, 0);

  return (
    <div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Quotes raised per customer, by entry date, including accepted/lost/open breakdown and quoted value (inc. GST).
      </p>
      <div className="mt-4">
        <DateFilter
          preset={preset}
          setPreset={setPreset}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <div className="rounded-xl border border-[var(--border)] px-4 py-3">
          <div className="text-xs uppercase text-[var(--muted)]">Quotes</div>
          <div className="text-xl font-semibold">{totalQuotes}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] px-4 py-3">
          <div className="text-xs uppercase text-[var(--muted)]">Total quoted value</div>
          <div className="text-xl font-semibold">{fmtCurrency(totalValue)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] px-4 py-3">
          <div className="text-xs uppercase text-[var(--muted)]">Accepted value</div>
          <div className="text-xl font-semibold">{fmtCurrency(totalAcceptedValue)}</div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Quotes</th>
              <th className="px-3 py-2 text-right">Accepted</th>
              <th className="px-3 py-2 text-right">Lost</th>
              <th className="px-3 py-2 text-right">Open</th>
              <th className="px-3 py-2 text-right">Total value</th>
              <th className="px-3 py-2 text-right">Accepted value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right">{r.quotes}</td>
                <td className="px-3 py-2 text-right">{r.accepted}</td>
                <td className="px-3 py-2 text-right">{r.lost}</td>
                <td className="px-3 py-2 text-right">{r.open}</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(r.totalValue)}</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(r.acceptedValue)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                  No quotes in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier spend
// ---------------------------------------------------------------------------

type PoFuel = { id: string; fuel_levy_type: string | null; fuel_levy_value: number | null };

function SupplierReport({ poLines, poFuel }: { poLines: PoLine[]; poFuel: PoFuel[] }) {
  const { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range } = useDateRange();

  const rows = useMemo(() => {
    const bySupplier = new Map<string, { name: string; poNumbers: Set<string>; spend: number }>();
    // Each PO's goods subtotal, so a % fuel levy can be worked out; the levy is added once per PO.
    const poSub = new Map<string, number>();
    for (const l of poLines) poSub.set(l.purchase_order_id, (poSub.get(l.purchase_order_id) || 0) + (Number(l.qty_pks) || 0) * (Number(l.unit_cost) || 0));
    const fuelById = new Map(poFuel.map((f) => [f.id, f]));
    const levyDone = new Set<string>();
    for (const l of poLines) {
      const po = l.purchase_orders;
      if (!po || po.archived) continue;
      const dateStr = po.order_date || po.delivery_date;
      if (!inRange(dateStr, range.start, range.end)) continue;
      const name = po.suppliers?.name || "No supplier";
      if (!bySupplier.has(name)) bySupplier.set(name, { name, poNumbers: new Set(), spend: 0 });
      const row = bySupplier.get(name)!;
      if (po.po_number) row.poNumbers.add(po.po_number);
      row.spend += (Number(l.qty_pks) || 0) * (Number(l.unit_cost) || 0);
      if (!levyDone.has(l.purchase_order_id)) {
        levyDone.add(l.purchase_order_id);
        const f = fuelById.get(l.purchase_order_id);
        if (f) row.spend += fuelLevyAmount(poSub.get(l.purchase_order_id) || 0, f.fuel_levy_type, f.fuel_levy_value);
      }
    }
    return Array.from(bySupplier.values())
      .map((r) => ({ name: r.name, poCount: r.poNumbers.size, spend: r.spend }))
      .sort((a, b) => b.spend - a.spend);
  }, [poLines, poFuel, range.start, range.end]);

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalPOs = rows.reduce((s, r) => s + r.poCount, 0);

  return (
    <div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Purchase order spend (ex GST, including any fuel levy) per supplier, by order date.
      </p>
      <div className="mt-4">
        <DateFilter
          preset={preset}
          setPreset={setPreset}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <div className="rounded-xl border border-[var(--border)] px-4 py-3">
          <div className="text-xs uppercase text-[var(--muted)]">Purchase orders</div>
          <div className="text-xl font-semibold">{totalPOs}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] px-4 py-3">
          <div className="text-xs uppercase text-[var(--muted)]">Total spend (ex GST)</div>
          <div className="text-xl font-semibold">{fmtCurrency(totalSpend)}</div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2 text-right">Purchase orders</th>
              <th className="px-3 py-2 text-right">Spend (ex GST)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right">{r.poCount}</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(r.spend)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[var(--muted)]">
                  No purchase orders in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Quotes win / loss
// ---------------------------------------------------------------------------

type QPreset = "week" | "lastweek" | "month" | "lastmonth" | "quarter" | "year" | "all" | "custom";

function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function quoteRange(preset: QPreset, customStart: string, customEnd: string): { start: string | null; end: string | null } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === "week") {
    const mon = mondayOf(now);
    return { start: toDateOnly(mon), end: toDateOnly(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)) };
  }
  if (preset === "lastweek") {
    const mon = mondayOf(now);
    return {
      start: toDateOnly(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 7)),
      end: toDateOnly(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 1)),
    };
  }
  if (preset === "lastmonth") return { start: toDateOnly(new Date(y, m - 1, 1)), end: toDateOnly(new Date(y, m, 0)) };
  if (preset === "month" || preset === "quarter" || preset === "year" || preset === "all" || preset === "custom") {
    return presetRange(preset as Preset, customStart, customEnd);
  }
  return { start: null, end: null };
}

function pct(n: number, d: number) {
  return d > 0 ? `${((n / d) * 100).toFixed(0)}%` : "—";
}

function QuotesReport({ projects, projectLines }: { projects: Project[]; projectLines: ProjectLine[] }) {
  const [preset, setPreset] = useState<QPreset>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const range = quoteRange(preset, customStart, customEnd);

  const linesByProject = useMemo(() => {
    const m = new Map<string, ProjectLine[]>();
    for (const l of projectLines) {
      if (!m.has(l.project_id)) m.set(l.project_id, []);
      m.get(l.project_id)!.push(l);
    }
    return m;
  }, [projectLines]);

  type Tally = { quotes: number; value: number; won: number; wonValue: number; lost: number; lostValue: number; open: number; openValue: number; cancelled: number };
  const blank = (): Tally => ({ quotes: 0, value: 0, won: 0, wonValue: 0, lost: 0, lostValue: 0, open: 0, openValue: 0, cancelled: 0 });
  const add = (t: Tally, outcome: string, value: number) => {
    t.quotes += 1;
    t.value += value;
    if (outcome === "Accepted") { t.won += 1; t.wonValue += value; }
    else if (outcome === "Lost") { t.lost += 1; t.lostValue += value; }
    else if (outcome === "Cancelled") { t.cancelled += 1; }
    else { t.open += 1; t.openValue += value; }
  };

  const { total, byPeriod, byType, monthly } = useMemo(() => {
    const total = blank();
    const inScope = projects.filter((p) => (includeArchived || !p.archived) && inRange((p.entry_date || "").slice(0, 10), range.start, range.end));
    // Weekly rows for ranges up to ~4 months, otherwise monthly.
    const dates = inScope.map((p) => (p.entry_date || "").slice(0, 10)).sort();
    const span = range.start && range.end ? (new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000 : dates.length ? (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000 : 0;
    const monthly = span > 125;
    const periods = new Map<string, { label: string; t: Tally }>();
    const types = new Map<string, Tally>();
    for (const p of inScope) {
      const value = computeProjectValue(p, linesByProject.get(p.id) || []);
      add(total, p.outcome, value);
      const d = new Date((p.entry_date || "").slice(0, 10) + "T00:00:00");
      let key: string;
      let label: string;
      if (monthly) {
        key = toDateOnly(new Date(d.getFullYear(), d.getMonth(), 1));
        label = d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
      } else {
        const mon = mondayOf(d);
        key = toDateOnly(mon);
        label = "Week of " + mon.toLocaleDateString("en-AU");
      }
      if (!periods.has(key)) periods.set(key, { label, t: blank() });
      add(periods.get(key)!.t, p.outcome, value);
      const jt = p.job_type || "Unknown";
      if (!types.has(jt)) types.set(jt, blank());
      add(types.get(jt)!, p.outcome, value);
    }
    return {
      total,
      monthly,
      byPeriod: Array.from(periods.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, v]) => v),
      byType: Array.from(types.entries()).sort((a, b) => b[1].value - a[1].value),
    };
  }, [projects, linesByProject, range.start, range.end, includeArchived]);

  const btn = (p: QPreset, label: string) => (
    <button
      key={p}
      onClick={() => setPreset(p)}
      className={`rounded-lg px-3 py-1.5 text-sm ${preset === p ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"}`}
    >
      {label}
    </button>
  );
  const decided = total.won + total.lost;
  const decidedValue = total.wonValue + total.lostValue;
  const card = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl border border-[var(--border)] px-4 py-3">
      <div className="text-xs uppercase text-[var(--muted)]">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
  const rowCells = (t: Tally) => (
    <>
      <td className="px-3 py-2 text-right">{t.quotes}</td>
      <td className="px-3 py-2 text-right">{fmtCurrency(t.value)}</td>
      <td className="px-3 py-2 text-right">{t.won}</td>
      <td className="px-3 py-2 text-right">{fmtCurrency(t.wonValue)}</td>
      <td className="px-3 py-2 text-right">{t.lost}</td>
      <td className="px-3 py-2 text-right">{fmtCurrency(t.lostValue)}</td>
      <td className="px-3 py-2 text-right">{t.open}</td>
      <td className="px-3 py-2 text-right font-medium">{pct(t.won, t.won + t.lost)}</td>
      <td className="px-3 py-2 text-right font-medium">{pct(t.wonValue, t.wonValue + t.lostValue)}</td>
    </>
  );
  const head = (first: string) => (
    <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
      <tr>
        <th className="px-3 py-2">{first}</th>
        <th className="px-3 py-2 text-right">Quotes</th>
        <th className="px-3 py-2 text-right">Value</th>
        <th className="px-3 py-2 text-right">Won</th>
        <th className="px-3 py-2 text-right">Won value</th>
        <th className="px-3 py-2 text-right">Lost</th>
        <th className="px-3 py-2 text-right">Lost value</th>
        <th className="px-3 py-2 text-right">Open</th>
        <th className="px-3 py-2 text-right">Win rate (no.)</th>
        <th className="px-3 py-2 text-right">Win rate ($)</th>
      </tr>
    </thead>
  );

  return (
    <div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Quotes by the date they were created, with how many were won (Accepted), lost, or are still open, and their value (inc GST).
        Win rate = won ÷ (won + lost), so open and cancelled quotes don&apos;t count against you.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {btn("week", "This week")}
        {btn("lastweek", "Last week")}
        {btn("month", "This month")}
        {btn("lastmonth", "Last month")}
        {btn("quarter", "This quarter")}
        {btn("year", "This year")}
        {btn("all", "All time")}
        {btn("custom", "Custom range")}
        {preset === "custom" && (
          <span className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm" />
            <span className="text-[var(--muted)]">to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm" />
          </span>
        )}
        <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          <span>Include archived quotes</span>
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        {card("Quotes created", String(total.quotes), fmtCurrency(total.value))}
        {card("Won", String(total.won), fmtCurrency(total.wonValue))}
        {card("Lost", String(total.lost), fmtCurrency(total.lostValue))}
        {card("Still open", String(total.open), fmtCurrency(total.openValue))}
        {card("Win rate (by number)", pct(total.won, decided), `${total.won} of ${decided} decided`)}
        {card("Win rate (by value)", pct(total.wonValue, decidedValue), `${fmtCurrency(total.wonValue)} of ${fmtCurrency(decidedValue)}`)}
      </div>
      {total.cancelled > 0 && <p className="mt-2 text-xs text-[var(--muted)]">{total.cancelled} cancelled quote(s) are counted in &quot;Quotes created&quot; but not in won, lost or open.</p>}

      <h3 className="mt-6 text-sm font-semibold">{monthly ? "By month" : "By week"}</h3>
      <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          {head(monthly ? "Month" : "Week")}
          <tbody>
            {byPeriod.map((r) => (
              <tr key={r.label} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">{r.label}</td>
                {rowCells(r.t)}
              </tr>
            ))}
            {byPeriod.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-[var(--muted)]">No quotes in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-sm font-semibold">By job type</h3>
      <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          {head("Job type")}
          <tbody>
            {byType.map(([name, t]) => (
              <tr key={name} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">{name}</td>
                {rowCells(t)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Quotes are grouped by the date they were created, so a quote created last month and accepted this week counts in last month.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level tabs
// ---------------------------------------------------------------------------

type Tab = "inventory" | "quotes" | "customers" | "suppliers" | "jobs" | "pnl" | "sales" | "weekly";

export default function ReportsView({
  parts,
  poLines,
  poFuel = [],
  woLines,
  projects,
  projectLines,
  jobWorkOrders,
  jobSwms,
  jobInspections,
  jobLines,
  pl,
}: {
  parts: Part[];
  poLines: PoLine[];
  poFuel?: PoFuel[];
  woLines: WoLine[];
  projects: Project[];
  projectLines: ProjectLine[];
  jobWorkOrders: JobRow[];
  jobSwms: JobSwms[];
  jobInspections: JobInspection[];
  jobLines: JobLine[];
  pl: {
    projects: PlProject[];
    projectLines: PlProjectLine[];
    workOrders: PlWorkOrder[];
    woLines: PlWoLine[];
    labourItems: PlLabour[];
    invoices: PlInvoice[];
    invoiceLines?: PlInvoiceLine[];
    payments: PlPayment[];
    invoicesAvailable: boolean;
  };
}) {
  const [tab, setTab] = useState<Tab>("inventory");

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        tab === t ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {tabBtn("inventory", "Inventory movement")}
        {tabBtn("quotes", "Quotes win/loss")}
        {tabBtn("customers", "Customer activity")}
        {tabBtn("suppliers", "Supplier spend")}
        {tabBtn("sales", "Product sales")}
        {tabBtn("weekly", "Weekly report")}
        {tabBtn("pnl", "Profit & loss")}
        {tabBtn("jobs", "Jobs & SWMS")}
      </div>

      {tab === "inventory" && <InventoryReport parts={parts} poLines={poLines} woLines={woLines} />}
      {tab === "quotes" && <QuotesReport projects={projects} projectLines={projectLines} />}
      {tab === "customers" && <CustomerReport projects={projects} projectLines={projectLines} />}
      {tab === "suppliers" && <SupplierReport poLines={poLines} poFuel={poFuel} />}
      {tab === "sales" && <ProductSalesReport />}
      {tab === "weekly" && <WeeklyReport workOrders={jobWorkOrders} inspections={jobInspections} projects={projects as any} projectLines={projectLines as any} />}
      {tab === "pnl" && <ProfitLossReport {...pl} />}
      {tab === "jobs" && <JobsSwmsReport workOrders={jobWorkOrders} swms={jobSwms} inspections={jobInspections} lines={jobLines} />}
    </div>
  );
}
