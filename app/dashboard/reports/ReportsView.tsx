"use client";

import { supplyPackPrice } from "@/lib/priceTiers";
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

function SupplierReport({ poLines }: { poLines: PoLine[] }) {
  const { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range } = useDateRange();

  const rows = useMemo(() => {
    const bySupplier = new Map<string, { name: string; poNumbers: Set<string>; spend: number }>();
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
    }
    return Array.from(bySupplier.values())
      .map((r) => ({ name: r.name, poCount: r.poNumbers.size, spend: r.spend }))
      .sort((a, b) => b.spend - a.spend);
  }, [poLines, range.start, range.end]);

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalPOs = rows.reduce((s, r) => s + r.poCount, 0);

  return (
    <div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Purchase order spend (ex GST) per supplier, by order date.
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
// Top-level tabs
// ---------------------------------------------------------------------------

type Tab = "inventory" | "customers" | "suppliers";

export default function ReportsView({
  parts,
  poLines,
  woLines,
  projects,
  projectLines,
}: {
  parts: Part[];
  poLines: PoLine[];
  woLines: WoLine[];
  projects: Project[];
  projectLines: ProjectLine[];
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
      <div className="mt-4 flex gap-2">
        {tabBtn("inventory", "Inventory movement")}
        {tabBtn("customers", "Customer activity")}
        {tabBtn("suppliers", "Supplier spend")}
      </div>

      {tab === "inventory" && <InventoryReport parts={parts} poLines={poLines} woLines={woLines} />}
      {tab === "customers" && <CustomerReport projects={projects} projectLines={projectLines} />}
      {tab === "suppliers" && <SupplierReport poLines={poLines} />}
    </div>
  );
}
