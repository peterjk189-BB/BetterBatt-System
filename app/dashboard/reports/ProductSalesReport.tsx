"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  key: string;
  code: string;
  name: string;
  unit: string;
  invoices: Set<string>;
  qty: number;
  ex: number;
  cost: number;
};

type SortKey = "name" | "invoices" | "qty" | "ex" | "inc" | "avg" | "margin";

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const num = (n: number) => n.toLocaleString("en-AU", { maximumFractionDigits: 2 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(p: string): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === "week") {
    // Weeks run Monday to Sunday.
    const mon = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7));
    return [iso(mon), iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6))];
  }
  if (p === "month") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (p === "lastmonth") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  // Australian financial year runs 1 July - 30 June.
  const fyStart = m >= 6 ? y : y - 1;
  if (p === "fy") return [iso(new Date(fyStart, 6, 1)), iso(new Date(fyStart + 1, 5, 30))];
  if (p === "lastfy") return [iso(new Date(fyStart - 1, 6, 1)), iso(new Date(fyStart, 5, 30))];
  return ["", ""];
}

export default function ProductSalesReport() {
  const supabase = createClient();
  const [lines, setLines] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("fy");
  const [from, setFrom] = useState(presetRange("fy")[0]);
  const [to, setTo] = useState(presetRange("fy")[1]);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "ex", dir: -1 });

  useEffect(() => {
    (async () => {
      const base = "invoice_id, part_id, description, qty, line_ex, invoices(invoice_number, invoice_date, status)";
      let res: any = await supabase.from("invoice_lines").select(`${base}, parts(code, name, pack_cost_ex_gst, pack_unit)`);
      // pack_unit only exists after migration 0076.
      if (res.error) res = await supabase.from("invoice_lines").select(`${base}, parts(code, name, pack_cost_ex_gst)`);
      if (res.error) setError(res.error.message);
      else setLines(res.data ?? []);
    })();
  }, []);

  function choosePreset(p: string) {
    setPreset(p);
    if (p !== "custom") {
      const [a, b] = presetRange(p);
      setFrom(a);
      setTo(b);
    }
  }

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const l of lines ?? []) {
      const inv = l.invoices;
      if (!inv || inv.status === "Void" || (!includeDrafts && inv.status === "Draft")) continue;
      if (from && inv.invoice_date < from) continue;
      if (to && inv.invoice_date > to) continue;
      const p = l.parts;
      const key = l.part_id || `x:${(l.description || "").trim().toLowerCase()}`;
      const r =
        map.get(key) ??
        ({
          key,
          code: p?.code || "",
          name: p?.name || (l.description || "").trim() || "(no description)",
          unit: p?.pack_unit || (p ? "pack" : ""),
          invoices: new Set<string>(),
          qty: 0,
          ex: 0,
          cost: 0,
        } as Row);
      r.invoices.add(l.invoice_id);
      r.qty += Number(l.qty) || 0;
      r.ex += Number(l.line_ex) || 0;
      r.cost += (Number(l.qty) || 0) * (Number(p?.pack_cost_ex_gst) || 0);
      map.set(key, r);
    }
    const q = search.trim().toLowerCase();
    const list = [...map.values()].filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    const val = (r: Row, k: SortKey) =>
      k === "name" ? r.name.toLowerCase()
      : k === "invoices" ? r.invoices.size
      : k === "qty" ? r.qty
      : k === "ex" ? r.ex
      : k === "inc" ? r.ex * 1.1
      : k === "avg" ? (r.qty ? r.ex / r.qty : 0)
      : r.cost ? r.ex - r.cost : -Infinity;
    return list.sort((a, b) => {
      const x = val(a, sort.key);
      const y = val(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [lines, from, to, includeDrafts, search, sort]);

  const totals = useMemo(() => {
    const inv = new Set<string>();
    let qty = 0, ex = 0, cost = 0, costedEx = 0;
    for (const r of rows) {
      r.invoices.forEach((i) => inv.add(i));
      qty += r.qty;
      ex += r.ex;
      if (r.cost) { cost += r.cost; costedEx += r.ex; }
    }
    return { invoices: inv.size, qty, ex, cost, costedEx };
  }, [rows]);

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const out = [["Code", "Product", "Unit", "Invoices", "Qty sold", "Sales ex GST", "Sales inc GST", "Avg price ex GST", "Cost ex GST", "Margin $", "Margin %"].map(esc).join(",")];
    for (const r of rows) {
      const m = r.cost ? r.ex - r.cost : null;
      out.push([r.code, r.name, r.unit, r.invoices.size, r.qty, r.ex.toFixed(2), (r.ex * 1.1).toFixed(2), (r.qty ? r.ex / r.qty : 0).toFixed(2), r.cost ? r.cost.toFixed(2) : "", m === null ? "" : m.toFixed(2), m === null || !r.ex ? "" : ((m / r.ex) * 100).toFixed(1)].map(esc).join(","));
    }
    const blob = new Blob([out.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `product-sales-${from || "all"}-to-${to || "all"}.csv`;
    a.click();
  }

  const th = (k: SortKey, label: string, right = true) => (
    <th className={`px-3 py-2 ${right ? "text-right" : "text-left"}`}>
      <button onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === "name" ? 1 : -1 }))} className="font-medium hover:underline">
        {label}
        {sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Period
          <select value={preset} onChange={(e) => choosePreset(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg,inherit)]">
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="lastmonth">Last month</option>
            <option value="fy">This financial year</option>
            <option value="lastfy">Last financial year</option>
            <option value="all">All time</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {preset === "custom" && (
          <>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" /></label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" /></label>
          </>
        )}
        <input placeholder="Search product..." value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" />
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} />
          Include draft invoices
        </label>
        <button onClick={exportCsv} disabled={!rows.length} className="ml-auto rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50">Export CSV</button>
      </div>

      {error && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">Could not load sales: {error}</p>}
      {!lines && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      {lines && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Sales ex GST", money(totals.ex)],
              ["Sales inc GST", money(totals.ex * 1.1)],
              ["Units sold", num(totals.qty)],
              ["Invoices", String(totals.invoices)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className="text-xs text-[var(--muted)]">{l}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead className="bg-[#f2f0ec] text-xs text-[var(--muted)]">
                <tr>
                  {th("name", "Product", false)}
                  {th("invoices", "Invoices")}
                  {th("qty", "Qty sold")}
                  {th("ex", "Sales ex GST")}
                  {th("inc", "Sales inc GST")}
                  {th("avg", "Avg price")}
                  {th("margin", "Margin")}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = r.cost ? r.ex - r.cost : null;
                  return (
                    <tr key={r.key} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        <span className="font-medium">{r.name}</span>
                        {r.code && <span className="ml-2 text-xs text-[var(--muted)]">{r.code}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.invoices.size}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(r.qty)}{r.unit ? ` ${r.unit}${r.qty === 1 ? "" : "s"}` : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.ex)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.ex * 1.1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.qty ? r.ex / r.qty : 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                        {m === null ? "—" : `${money(m)}${r.ex ? ` (${((m / r.ex) * 100).toFixed(0)}%)` : ""}`}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">No item sales in this period.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{totals.invoices}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(totals.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals.ex)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals.ex * 1.1)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right tabular-nums">{totals.cost ? money(totals.costedEx - totals.cost) : "—"}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Counts products sold on invoices (void invoices excluded). Margin is sales less the product&apos;s current pack cost, so it&apos;s an estimate. Quote-based supply &amp; install work isn&apos;t itemised on invoices, so it isn&apos;t included here.
          </p>
        </>
      )}
    </div>
  );
}
