"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Part = {
  id: string;
  code: string | null;
  name: string;
  supplier_id: string | null;
  pack_per_multi: number;
  multi: number;
  pks: number;
  stock_on_hand: number;
  is_stock_item: boolean;
};

export default function CountSheet({ parts, suppliers }: { parts: Part[]; suppliers: { id: string; name: string }[] }) {
  const [supplierId, setSupplierId] = useState("");
  const [stockOnly, setStockOnly] = useState(true);
  const [showSystem, setShowSystem] = useState(false);

  const groups = useMemo(() => {
    const list = parts.filter((p) => (!stockOnly || p.is_stock_item) && (!supplierId || p.supplier_id === supplierId));
    const byId = new Map<string, Part[]>();
    for (const p of list) {
      const k = p.supplier_id || "";
      byId.set(k, [...(byId.get(k) ?? []), p]);
    }
    return Array.from(byId.entries())
      .map(([id, items]) => ({ name: suppliers.find((s) => s.id === id)?.name || "No supplier", items }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parts, suppliers, supplierId, stockOnly]);

  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/dashboard/parts" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          &larr; Inventory
        </Link>
        <select className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} /> Stock items only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} /> Show current stock (not a blind count)
        </label>
        <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Print count sheet
        </button>
      </div>

      <div className="mx-auto max-w-[900px] bg-white p-6 text-[12px] text-[#201f1c] shadow-sm print:p-0 print:shadow-none">
        <div className="flex items-end justify-between border-b-2 border-[#201f1c] pb-2">
          <div className="text-lg font-bold">Stocktake count sheet</div>
          <div className="text-right text-[11px]">
            Date: {today} &nbsp;&nbsp; Counted by: ____________ &nbsp;&nbsp; Checked by: ____________
          </div>
        </div>

        {groups.length === 0 && <p className="mt-6 text-[var(--muted)]">No items to show.</p>}

        {groups.map((g, gi) => (
          <section key={g.name} style={{ breakBefore: gi === 0 ? undefined : "page" }} className="mt-4">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">{g.name}</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f2f0ec] text-left text-[10px] uppercase" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}>
                  <th className="border border-[#c9c5bb] px-2 py-1">Code</th>
                  <th className="border border-[#c9c5bb] px-2 py-1">Item</th>
                  <th className="w-12 border border-[#c9c5bb] px-1 py-1 text-center">Pk / multi</th>
                  {showSystem && <th className="w-14 border border-[#c9c5bb] px-1 py-1 text-center">System packs</th>}
                  <th className="w-16 border border-[#c9c5bb] px-1 py-1 text-center">Multi</th>
                  <th className="w-16 border border-[#c9c5bb] px-1 py-1 text-center">Pks</th>
                  <th className="w-40 border border-[#c9c5bb] px-2 py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((p) => (
                  <tr key={p.id} style={{ breakInside: "avoid" }}>
                    <td className="border border-[#c9c5bb] px-2 py-2 font-mono text-[11px]">{p.code}</td>
                    <td className="border border-[#c9c5bb] px-2 py-2">{p.name}</td>
                    <td className="border border-[#c9c5bb] px-1 py-2 text-center">{p.pack_per_multi || ""}</td>
                    {showSystem && <td className="border border-[#c9c5bb] px-1 py-2 text-center">{Number(p.stock_on_hand)}</td>}
                    <td className="border border-[#c9c5bb] px-1 py-2"></td>
                    <td className="border border-[#c9c5bb] px-1 py-2"></td>
                    <td className="border border-[#c9c5bb] px-2 py-2"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
