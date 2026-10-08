"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";

type Part = {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  supplier_id: string | null;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  price_retail: number | null;
  price_trade: number | null;
  price_regency: number | null;
  is_stock_item: boolean | null;
};
type Supplier = { id: string; name: string };

const GST = 1.1;

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const round2 = (n: number) => Math.round(n * 100) / 100;
const inc = (ex: number) => round2(ex * GST);

type GroupBy = "supplier" | "type" | "none";

export default function PriceBook({ parts, suppliers }: { parts: Part[]; suppliers: Supplier[] }) {
  const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("supplier");
  const [showCost, setShowCost] = useState(true);
  const [showEx, setShowEx] = useState(false);
  const [onlyPriced, setOnlyPriced] = useState(false);

  const today = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts
      .filter((p) => !supplierFilter || p.supplier_id === supplierFilter)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q))
      .filter(
        (p) => !onlyPriced || (Number(p.price_retail) || 0) > 0 || (Number(p.price_trade) || 0) > 0 || (Number(p.price_regency) || 0) > 0
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parts, search, supplierFilter, onlyPriced]);

  const groups = useMemo(() => {
    const keyOf = (p: Part) =>
      groupBy === "supplier"
        ? (p.supplier_id && supplierName[p.supplier_id]) || "No supplier"
        : groupBy === "type"
        ? p.type?.trim() || "Other"
        : "";
    const map = new Map<string, Part[]>();
    for (const p of rows) {
      const k = keyOf(p);
      map.set(k, [...(map.get(k) || []), p]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, groupBy, supplierName]);

  function downloadCsv() {
    const data = rows.map((p) => {
      const cost = Number(p.pack_cost_ex_gst) || 0;
      const r = Number(p.price_retail) || 0;
      const t = Number(p.price_trade) || 0;
      const g = Number(p.price_regency) || 0;
      return {
        Code: p.code || "",
        Item: p.name,
        Supplier: (p.supplier_id && supplierName[p.supplier_id]) || "",
        Type: p.type || "",
        "Coverage m2/pack": p.coverage_m2,
        "Cost ex GST": cost ? cost.toFixed(2) : "",
        "Cost inc GST": cost ? inc(cost).toFixed(2) : "",
        "Retail ex GST": r ? r.toFixed(2) : "",
        "Retail inc GST": r ? inc(r).toFixed(2) : "",
        "Trade ex GST": t ? t.toFixed(2) : "",
        "Trade inc GST": t ? inc(t).toFixed(2) : "",
        "Regency ex GST": g ? g.toFixed(2) : "",
        "Regency inc GST": g ? inc(g).toFixed(2) : "",
      };
    });
    const csv = Papa.unparse(data);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `price-book-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sellCols: { label: string; field: "price_retail" | "price_trade" | "price_regency" }[] = [
    { label: "Retail", field: "price_retail" },
    { label: "Trade", field: "price_trade" },
    { label: "Regency", field: "price_regency" },
  ];
  const colCount = 3 + (showCost ? 2 : 0) + 3;

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

      <div className="print:hidden">
        <Link href="/dashboard/parts" className="text-sm text-[var(--muted)] hover:underline">
          &larr; Inventory
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Price book</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Straight from Inventory — change a price there and it updates here. Sell prices are entered ex GST; GST is added at 10%.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadCsv} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
              Download CSV
            </button>
            <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              Print / Save as PDF
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <input
            placeholder="Search code or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          />
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            Group by
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              <option value="supplier">Supplier</option>
              <option value="type">Type</option>
              <option value="none">No grouping</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} />
            Show cost (turn off for a customer copy)
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={showEx} onChange={(e) => setShowEx(e.target.checked)} />
            Show ex GST under each price
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={onlyPriced} onChange={(e) => setOnlyPriced(e.target.checked)} />
            Only items with a sell price
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-6 text-black print:mt-0 print:border-none print:p-0">
        <div className="flex items-end justify-between border-b-2 border-black pb-3">
          <div>
            <div className="text-2xl font-bold">Better Batt Insulation</div>
            <div className="text-sm text-gray-600">Price book{showCost ? " (internal — includes cost)" : ""}</div>
          </div>
          <div className="text-right text-sm text-gray-600">
            <div>{today}</div>
            <div>All sell prices include GST</div>
          </div>
        </div>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-600">
              <th className="px-2 py-1.5">Code</th>
              <th className="px-2 py-1.5">Product</th>
              <th className="px-2 py-1.5 text-right">m²/pack</th>
              {showCost && (
                <>
                  <th className="px-2 py-1.5 text-right">Cost ex GST</th>
                  <th className="px-2 py-1.5 text-right">Cost inc GST</th>
                </>
              )}
              {sellCols.map((c) => (
                <th key={c.field} className="px-2 py-1.5 text-right">
                  {c.label} inc GST
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, items]) => (
              <Fragment key={group || "all"}>
                {group && (
                  <tr className="break-after-avoid">
                    <td colSpan={colCount} className="bg-black px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
                      {group}
                    </td>
                  </tr>
                )}
                {items.map((p) => {
                  const cost = Number(p.pack_cost_ex_gst) || 0;
                  return (
                    <tr key={p.id} className="break-inside-avoid border-b border-gray-200">
                      <td className="px-2 py-1.5 text-gray-500">{p.code || "—"}</td>
                      <td className="px-2 py-1.5 font-medium">{p.name}</td>
                      <td className="px-2 py-1.5 text-right text-gray-600">{Number(p.coverage_m2) || "—"}</td>
                      {showCost && (
                        <>
                          <td className="px-2 py-1.5 text-right tabular-nums">{cost ? money(cost) : "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{cost ? money(inc(cost)) : "—"}</td>
                        </>
                      )}
                      {sellCols.map((c) => {
                        const ex = Number(p[c.field]) || 0;
                        return (
                          <td key={c.field} className="px-2 py-1.5 text-right tabular-nums">
                            {ex ? (
                              <>
                                <span className="font-semibold">{money(inc(ex))}</span>
                                {showEx && <div className="text-[11px] text-gray-500">{money(ex)} ex</div>}
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-2 py-8 text-center text-gray-400">
                  No products match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-gray-500">
          Prices are per pack. Retail, Trade and Regency are shown including 10% GST; a dash means no price has been set yet.
        </p>
      </div>
    </div>
  );
}
