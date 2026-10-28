"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PRICE_TIERS, supplyPackPrice, tierPriceMissing } from "@/lib/priceTiers";

type Part = {
  id: string;
  name: string;
  coverage_m2: number;
  supply_charge_per_pack: number;
  price_retail: number;
  price_trade: number;
  price_regency: number;
};
// One row per area, each with its own product (walls, ceiling, garage... can all be different products).
type Row = { name: string; partId: string; search: string; length: string; width: string; m2: string };

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const num = (s: string) => Number(s) || 0;
const r1 = (n: number) => Math.round(n * 10) / 10;
const blankRow = (n: number): Row => ({ name: `Area ${n}`, partId: "", search: "", length: "", width: "", m2: "" });

export default function Calculator({ parts }: { parts: Part[] }) {
  const [tier, setTier] = useState<string>("retail");
  const [rows, setRows] = useState<Row[]>([blankRow(1)]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [wasteOn, setWasteOn] = useState(false);
  const [wastePct, setWastePct] = useState("5");

  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);
  const matches = (q: string) => {
    const t = q.trim().toLowerCase();
    return t ? parts.filter((p) => t.split(/\s+/).every((w) => p.name.toLowerCase().includes(w))) : parts;
  };

  function setRow(i: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r, k) => {
        if (k !== i) return r;
        const next = { ...r, ...patch };
        // Length x width fills the area in, unless the area itself is being typed.
        if (!("m2" in patch) && num(next.length) > 0 && num(next.width) > 0) next.m2 = String(r1(num(next.length) * num(next.width)));
        return next;
      })
    );
  }

  const wasteMul = 1 + (wasteOn ? num(wastePct) / 100 : 0);
  const packsFor = (p: Part, m2: number) => (m2 > 0 && p.coverage_m2 > 0 ? Math.ceil(m2 / p.coverage_m2 - 1e-9) : 0);

  // Same product on several rows is added together first, then rounded up to whole packs.
  const summary = useMemo(() => {
    const byPart = new Map<string, number>();
    for (const r of rows) if (r.partId && num(r.m2) > 0) byPart.set(r.partId, (byPart.get(r.partId) || 0) + num(r.m2));
    return Array.from(byPart.entries()).map(([id, m2]) => {
      const p = partById[id];
      const need = m2 * wasteMul;
      const packs = packsFor(p, need);
      const unit = supplyPackPrice(p, tier);
      return { p, m2, need, packs, unit, ex: packs * unit, missing: tierPriceMissing(p, tier) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tier, wasteMul, partById]);

  const totalM2 = rows.reduce((s, r) => s + num(r.m2), 0);
  const grandEx = summary.reduce((s, x) => s + x.ex, 0);
  const calcParam = summary.map((x) => `${x.p.id}:${r1(x.need)}`).join(",");

  const inp = "w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm";
  const lab = "flex flex-col gap-1 text-xs text-[var(--muted)]";

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <h1 className="text-2xl font-bold">Pack calculator</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Add each area with its own product (walls, ceiling, garage…). It works out the packs and the sell price. Supply-only prices, ex GST unless stated.
      </p>

      <div className="mt-5 rounded-xl border border-[var(--border)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">Areas and products</h2>
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-sm">
            {PRICE_TIERS.map((t) => (
              <button key={t.value} onClick={() => setTier(t.value)} className={`px-4 py-1.5 ${tier === t.value ? "bg-accent text-white" : "text-[var(--muted)]"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {rows.map((r, i) => {
            const p = r.partId ? partById[r.partId] : null;
            const rowM2 = num(r.m2);
            return (
              <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr]">
                  <label className={`${lab} col-span-2 sm:col-span-1`}>
                    Area name
                    <input className={inp} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                  </label>
                  <label className={lab}>
                    Length (m)
                    <input className={inp} type="number" step="0.1" placeholder="optional" value={r.length} onChange={(e) => setRow(i, { length: e.target.value })} />
                  </label>
                  <label className={lab}>
                    Width / height (m)
                    <input className={inp} type="number" step="0.1" placeholder="optional" value={r.width} onChange={(e) => setRow(i, { width: e.target.value })} />
                  </label>
                  <label className={lab}>
                    Area (m²)
                    <input className={inp} type="number" step="0.1" value={r.m2} onChange={(e) => setRow(i, { m2: e.target.value })} />
                  </label>
                </div>

                <div className="relative mt-2">
                  <label className={lab}>
                    Product — type to search (e.g. wall R2.5 430), then click it
                    <input
                      className={inp}
                      placeholder="Start typing a product name…"
                      value={r.search}
                      onFocus={() => setOpenIdx(i)}
                      onBlur={() => setOpenIdx((cur) => (cur === i ? null : cur))}
                      onChange={(e) => {
                        setRow(i, { search: e.target.value, partId: r.partId && e.target.value !== p?.name ? "" : r.partId });
                        setOpenIdx(i);
                      }}
                    />
                  </label>
                  {openIdx === i && (
                    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                      {matches(r.search)
                        .slice(0, 40)
                        .map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setRow(i, { partId: x.id, search: x.name });
                              setOpenIdx(null);
                            }}
                            className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[#f2f0ec]"
                          >
                            <span>{x.name}</span>
                            <span className="whitespace-nowrap text-xs text-[var(--muted)]">{x.coverage_m2} m²/pack</span>
                          </button>
                        ))}
                      {matches(r.search).length === 0 && <div className="px-3 py-3 text-sm text-[var(--muted)]">No product matches “{r.search}”.</div>}
                      {matches(r.search).length > 40 && <div className="px-3 py-2 text-xs text-[var(--muted)]">Showing 40 of {matches(r.search).length} — keep typing to narrow it down.</div>}
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                  <span>
                    {p && rowM2 > 0
                      ? `This area on its own: ${packsFor(p, rowM2 * wasteMul)} packs · ${money(packsFor(p, rowM2 * wasteMul) * supplyPackPrice(p, tier))} ex GST`
                      : "Pick a product and enter the area."}
                  </span>
                  {rows.length > 1 && (
                    <button onClick={() => setRows((prev) => prev.filter((_, k) => k !== i))} className="hover:underline">
                      Remove this area
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button onClick={() => setRows((p) => [...p, blankRow(p.length + 1)])} className="font-medium text-accent hover:underline">
            + Add another area / product
          </button>
          <label className="ml-auto flex items-center gap-2">
            <input type="checkbox" checked={wasteOn} onChange={(e) => setWasteOn(e.target.checked)} />
            Allow
            <input className="w-16 rounded-lg border border-[var(--border)] px-2 py-1 text-right" type="number" value={wastePct} onChange={(e) => setWastePct(e.target.value)} />% for waste
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] p-5">
        <h2 className="text-base font-bold">What the customer needs</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{r1(totalM2)} m² across {rows.length} area{rows.length === 1 ? "" : "s"}. The same product on more than one area is added together, then rounded up to whole packs.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-1.5 pr-3">Product</th>
                <th className="px-3 py-1.5 text-right">m² (incl. waste)</th>
                <th className="px-3 py-1.5 text-right">Packs</th>
                <th className="px-3 py-1.5 text-right">Per pack</th>
                <th className="px-3 py-1.5 text-right">Price ex GST</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((x) => (
                <tr key={x.p.id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3">
                    {x.p.name}
                    {x.missing && <div className="text-[11px] text-amber-700">No {tier} price set — standard price used</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r1(x.need)}
                    <div className="text-[11px] text-[var(--muted)]">covers {r1(x.packs * x.p.coverage_m2)} · {r1(x.packs * x.p.coverage_m2 - x.need)} spare</div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{x.packs}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(x.unit)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(x.ex)}</td>
                </tr>
              ))}
              {summary.length === 0 && (
                <tr>
                  <td colSpan={5} className="border-t border-[var(--border)] py-5 text-center text-[var(--muted)]">
                    Pick a product and enter an area above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs text-[var(--muted)]">
            {PRICE_TIERS.find((t) => t.value === tier)?.label} prices. Ex GST {money(grandEx)} · GST {money(grandEx * 0.1)}.
          </span>
          <span className="text-sm">
            Total <span className="text-2xl font-bold tabular-nums">{money(grandEx * 1.1)}</span> inc GST
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          {summary.length > 0 && (
            <Link href={`/dashboard/quotes/new?calc=${encodeURIComponent(calcParam)}&tier=${tier}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              Create quote from this
            </Link>
          )}
          <button onClick={() => window.print()} disabled={summary.length === 0} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium disabled:opacity-50">
            Print for the customer
          </button>
        </div>
      </div>
    </div>
  );
}
