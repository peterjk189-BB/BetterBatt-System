"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { packsNeeded } from "@/lib/picking";

type Row = {
  id: string;
  code: string | null;
  name: string;
  supplier: string;
  onHand: number;
  reserved: number;
  onOrder: number;
  reorder: number | null;
  cost: number;
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export default function LowStockReport() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needMigration, setNeedMigration] = useState(false);
  const [filter, setFilter] = useState<"low" | "all">("low");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const partsRes: any = await supabase.from("parts").select("*, suppliers(name)").eq("archived", false).order("name");
      if (partsRes.error) {
        setError(partsRes.error.message);
        setLoading(false);
        return;
      }
      const partsData = (partsRes.data ?? []) as any[];
      setNeedMigration(partsData.length > 0 && !("reorder_level" in partsData[0]));

      // Stock set aside on picking slips (allocated, not yet picked).
      const held: any = await supabase
        .from("work_order_lines")
        .select("part_id, qty, parts(coverage_m2), work_orders!inner(archived)")
        .eq("allocated", true)
        .eq("picked", false)
        .eq("work_orders.archived", false);
      const reserved = new Map<string, number>();
      for (const r of (held.data ?? []) as any[]) {
        if (!r.part_id) continue;
        const packs = packsNeeded(Number(r.qty) || 0, Number(r.parts?.coverage_m2) || 0);
        if (packs) reserved.set(r.part_id, (reserved.get(r.part_id) ?? 0) + packs);
      }

      // Packs on purchase orders that are Ordered but not received yet.
      const po: any = await supabase
        .from("purchase_order_lines")
        .select("part_id, qty_pks, received_multi, received_pks, purchase_orders!inner(status, archived)")
        .eq("purchase_orders.status", "Ordered")
        .eq("purchase_orders.archived", false);
      const onOrder = new Map<string, number>();
      for (const l of (po.data ?? []) as any[]) {
        if (!l.part_id) continue;
        const part = partsData.find((p) => p.id === l.part_id);
        const got = (Number(l.received_multi) || 0) * (Number(part?.pack_per_multi) || 0) + (Number(l.received_pks) || 0);
        const left = Math.max(0, (Number(l.qty_pks) || 0) - got);
        if (left) onOrder.set(l.part_id, (onOrder.get(l.part_id) ?? 0) + left);
      }

      setRows(
        partsData
          .filter((p) => p.is_stock_item !== false)
          .map((p) => {
            const s = Array.isArray(p.suppliers) ? p.suppliers[0] : p.suppliers;
            return {
              id: p.id,
              code: p.code ?? null,
              name: p.name,
              supplier: s?.name || "—",
              onHand: Number(p.stock_on_hand) || 0,
              reserved: reserved.get(p.id) ?? 0,
              onOrder: onOrder.get(p.id) ?? 0,
              reorder: p.reorder_level == null ? null : Number(p.reorder_level),
              cost: Number(p.pack_cost_ex_gst) || 0,
            };
          })
      );
      setLoading(false);
    })();
  }, [supabase]);

  async function saveLevel(id: string, text: string) {
    const v = text.trim() === "" ? null : Number(text);
    if (v !== null && !(v >= 0)) return;
    setSaving(id);
    const { error: e } = await supabase.from("parts").update({ reorder_level: v }).eq("id", id);
    setSaving(null);
    if (e) setError(e.message);
    else setRows((rs) => rs.map((r) => (r.id === id ? { ...r, reorder: v } : r)));
  }

  const view = useMemo(() => {
    const withCalc = rows.map((r) => {
      const available = r.onHand - r.reserved;
      const low = r.reorder != null && available <= r.reorder;
      const out = available <= 0;
      // Suggested order: back up to the reorder level, less what is already on the way.
      const suggest = r.reorder != null ? Math.max(0, Math.ceil(r.reorder - available - r.onOrder)) : 0;
      return { ...r, available, low, out, suggest };
    });
    return withCalc
      .filter((r) => (supplierFilter ? r.supplier === supplierFilter : true))
      .filter((r) => (filter === "all" ? true : r.low))
      .sort((a, b) => Number(b.out) - Number(a.out) || b.suggest - a.suggest || a.name.localeCompare(b.name));
  }, [rows, filter, supplierFilter]);

  const suppliers = useMemo(() => Array.from(new Set(rows.map((r) => r.supplier))).sort(), [rows]);
  const noLevel = rows.filter((r) => r.reorder == null).length;
  const lowCount = view.filter((r) => r.low).length;
  const cost = view.reduce((t, r) => t + r.suggest * r.cost, 0);

  const th = "px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";
  const td = "px-2 py-1.5 align-middle";

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Low stock</h2>
          <p className="text-xs text-[var(--muted)]">
            Available = on hand minus stock set aside on picking slips. A product is low when available is at or below its reorder level (packs).
            Type a reorder level in the last column to switch a product on.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select className="rounded-lg border border-[var(--border)] px-2 py-1.5" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button onClick={() => setFilter("low")} className={`rounded-lg px-3 py-1.5 ${filter === "low" ? "bg-accent text-white" : "border border-[var(--border)]"}`}>
            Low only
          </button>
          <button onClick={() => setFilter("all")} className={`rounded-lg px-3 py-1.5 ${filter === "all" ? "bg-accent text-white" : "border border-[var(--border)]"}`}>
            All products
          </button>
        </div>
      </div>

      {needMigration && <p className="mt-3 text-sm text-amber-700">Reorder levels need migration 0093 to be run in Supabase first (add column parts.reorder_level).</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Products low</div><div className="text-xl font-semibold">{lowCount}</div></div>
            <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Suggested re-order cost (ex GST)</div><div className="text-xl font-semibold">{money(cost)}</div></div>
            <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Products with no reorder level</div><div className="text-xl font-semibold">{noLevel}</div></div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={th}>Product</th><th className={th}>Supplier</th>
                  <th className={th + " text-right"}>On hand</th><th className={th + " text-right"}>Reserved</th>
                  <th className={th + " text-right"}>Available</th><th className={th + " text-right"}>On order</th>
                  <th className={th + " text-right"}>Suggest order</th><th className={th + " text-right"}>Reorder level</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)]">
                    <td className={td}>
                      <Link href="/dashboard/parts" className="hover:underline">{r.code ? `${r.code} · ` : ""}{r.name}</Link>
                      {r.out && <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "#f5b5ae", color: "#000" }}>Out</span>}
                      {!r.out && r.low && <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "#fde9b8", color: "#000" }}>Low</span>}
                    </td>
                    <td className={td}>{r.supplier}</td>
                    <td className={td + " text-right tabular-nums"}>{num(r.onHand)}</td>
                    <td className={td + " text-right tabular-nums"}>{r.reserved ? num(r.reserved) : "—"}</td>
                    <td className={td + " text-right font-semibold tabular-nums"}>{num(r.available)}</td>
                    <td className={td + " text-right tabular-nums"}>{r.onOrder ? num(r.onOrder) : "—"}</td>
                    <td className={td + " text-right tabular-nums"}>{r.suggest ? num(r.suggest) : "—"}</td>
                    <td className={td + " text-right"}>
                      <input
                        key={`${r.id}-${r.reorder}`}
                        className="w-20 rounded border border-[var(--border)] px-2 py-1 text-right"
                        inputMode="decimal"
                        placeholder="—"
                        defaultValue={r.reorder ?? ""}
                        disabled={needMigration || saving === r.id}
                        onBlur={(e) => e.target.value.trim() !== String(r.reorder ?? "") && saveLevel(r.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                {view.length === 0 && (
                  <tr><td className={td + " text-[var(--muted)]"} colSpan={8}>{filter === "low" ? "Nothing is below its reorder level." : "No products."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
