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
type Area = { name: string; length: string; width: string; m2: string };
type Item = { partId: string; m2: number };

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const num = (s: string) => Number(s) || 0;
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function Calculator({ parts }: { parts: Part[] }) {
  const [tier, setTier] = useState<string>("retail");
  const [areas, setAreas] = useState<Area[]>([{ name: "Area 1", length: "", width: "", m2: "" }]);
  const [wasteOn, setWasteOn] = useState(true);
  const [wastePct, setWastePct] = useState("5");
  const [search, setSearch] = useState("");
  const [partId, setPartId] = useState("");
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Item[]>([]);

  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? parts.filter((p) => q.split(/\s+/).every((w) => p.name.toLowerCase().includes(w))) : parts;
  }, [parts, search]);
  const part = partById[partId] || null;

  const rawM2 = areas.reduce((s, a) => s + num(a.m2), 0);
  const needM2 = rawM2 * (1 + (wasteOn ? num(wastePct) / 100 : 0));
  const packsFor = (p: Part, m2: number) => (m2 > 0 && p.coverage_m2 > 0 ? Math.ceil(m2 / p.coverage_m2 - 1e-9) : 0);
  const packs = part ? packsFor(part, needM2) : 0;
  const unit = part ? supplyPackPrice(part, tier) : 0;
  const ex = packs * unit;

  function setArea(i: number, patch: Partial<Area>) {
    setAreas((prev) =>
      prev.map((a, k) => {
        if (k !== i) return a;
        const next = { ...a, ...patch };
        // Length x width fills the area in, unless the area itself is being typed.
        if (!("m2" in patch) && num(next.length) > 0 && num(next.width) > 0) next.m2 = String(r1(num(next.length) * num(next.width)));
        return next;
      })
    );
  }

  const rows = list.map((it) => {
    const p = partById[it.partId];
    const pk = p ? packsFor(p, it.m2) : 0;
    return { it, p, pk, ex: p ? pk * supplyPackPrice(p, tier) : 0 };
  });
  const grandEx = rows.reduce((s, r) => s + r.ex, 0);
  const calcParam = list.map((it) => `${it.partId}:${r1(it.m2)}`).join(",");

  const inp = "w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm";
  const lab = "flex flex-col gap-1 text-xs text-[var(--muted)]";

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <h1 className="text-2xl font-bold">Pack calculator</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Works out how many packs a customer needs and what to charge. Supply-only prices, ex GST unless stated.</p>

      <div className="mt-5 rounded-xl border border-[var(--border)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">1 · How much area?</h2>
          <button onClick={() => setAreas((p) => [...p, { name: `Area ${p.length + 1}`, length: "", width: "", m2: "" }])} className="text-sm text-accent hover:underline">
            + Add another area
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {areas.map((a, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
              <label className={lab}>
                Area name
                <input className={inp} value={a.name} onChange={(e) => setArea(i, { name: e.target.value })} />
              </label>
              <label className={lab}>
                Length (m)
                <input className={inp} type="number" step="0.1" placeholder="optional" value={a.length} onChange={(e) => setArea(i, { length: e.target.value })} />
              </label>
              <label className={lab}>
                Width / height (m)
                <input className={inp} type="number" step="0.1" placeholder="optional" value={a.width} onChange={(e) => setArea(i, { width: e.target.value })} />
              </label>
              <label className={lab}>
                Area (m²)
                <input className={inp} type="number" step="0.1" value={a.m2} onChange={(e) => setArea(i, { m2: e.target.value })} />
              </label>
              {areas.length > 1 ? (
                <button onClick={() => setAreas((p) => p.filter((_, k) => k !== i))} className="pb-2 text-sm text-[var(--muted)] hover:underline">
                  Remove
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold">{r1(rawM2)} m² in total</span>
          <label className="ml-auto flex items-center gap-2">
            <input type="checkbox" checked={wasteOn} onChange={(e) => setWasteOn(e.target.checked)} />
            Allow
            <input className="w-16 rounded-lg border border-[var(--border)] px-2 py-1 text-right" type="number" value={wastePct} onChange={(e) => setWastePct(e.target.value)} />% for waste
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">2 · Product and price</h2>
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-sm">
            {PRICE_TIERS.map((t) => (
              <button key={t.value} onClick={() => setTier(t.value)} className={`px-4 py-1.5 ${tier === t.value ? "bg-accent text-white" : "text-[var(--muted)]"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mt-3">
          <label className={lab}>
            Product — type to search (e.g. wall R2.5 430), then click the one you want
            <input
              className={inp}
              placeholder="Start typing a product name…"
              value={search}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
                if (partId && e.target.value !== partById[partId]?.name) setPartId("");
              }}
            />
          </label>
          {open && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
              {filtered.slice(0, 40).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPartId(p.id);
                    setSearch(p.name);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[#f2f0ec]"
                >
                  <span>{p.name}</span>
                  <span className="whitespace-nowrap text-xs text-[var(--muted)]">{p.coverage_m2} m²/pack</span>
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-3 text-sm text-[var(--muted)]">No product matches “{search}”.</div>}
              {filtered.length > 40 && <div className="px-3 py-2 text-xs text-[var(--muted)]">Showing 40 of {filtered.length} — keep typing to narrow it down.</div>}
            </div>
          )}
          {part && !open && <p className="mt-1 text-xs text-[var(--muted)]">Selected: {part.name}</p>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-[#f2f0ec] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Packs needed</div>
            <div className="text-2xl font-bold tabular-nums">{packs}</div>
            <div className="text-xs text-[var(--muted)]">{r1(needM2)} m² {wasteOn && num(wastePct) > 0 ? `incl. ${num(wastePct)}% waste` : "needed"}</div>
          </div>
          <div className="rounded-lg bg-[#f2f0ec] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Covers</div>
            <div className="text-2xl font-bold tabular-nums">{part ? r1(packs * part.coverage_m2) : 0} m²</div>
            <div className="text-xs text-[var(--muted)]">{part && packs ? `${r1(packs * part.coverage_m2 - needM2)} m² spare · ${part.coverage_m2} m²/pack` : ""}</div>
          </div>
          <div className="rounded-lg bg-[#f2f0ec] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Sell price (ex GST)</div>
            <div className="text-2xl font-bold tabular-nums">{money(ex)}</div>
            <div className="text-xs text-[var(--muted)]">{part ? `${money(unit)} per pack` : ""}</div>
          </div>
          <div className="rounded-lg bg-[#f2f0ec] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Inc GST</div>
            <div className="text-2xl font-bold tabular-nums">{money(ex * 1.1)}</div>
            <div className="text-xs text-[var(--muted)]">10% GST</div>
          </div>
        </div>
        {part && tierPriceMissing(part, tier) && (
          <p className="mt-2 text-xs text-amber-700">No {tier} price is set for this product, so its standard price is used. Set it under Inventory.</p>
        )}
        <button
          disabled={!part || packs === 0}
          onClick={() => part && setList((p) => [...p, { partId: part.id, m2: needM2 }])}
          className="mt-4 rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-bold text-[#201f1c] disabled:opacity-50"
        >
          + Add to the customer&apos;s list
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] p-5">
        <h2 className="text-base font-bold">3 · Customer&apos;s list</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-1.5 pr-3">Product</th>
                <th className="px-3 py-1.5 text-right">m²</th>
                <th className="px-3 py-1.5 text-right">Packs</th>
                <th className="px-3 py-1.5 text-right">Price ex GST</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3">{r.p?.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r1(r.it.m2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.pk}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(r.ex)}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => setList((p) => p.filter((_, k) => k !== i))} className="text-xs text-[var(--muted)] hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="border-t border-[var(--border)] py-5 text-center text-[var(--muted)]">
                    Nothing added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs text-[var(--muted)]">Prices are at the {PRICE_TIERS.find((t) => t.value === tier)?.label} tier. Ex GST {money(grandEx)}.</span>
          <span className="text-sm">
            Total <span className="text-2xl font-bold tabular-nums">{money(grandEx * 1.1)}</span> inc GST
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          {list.length > 0 ? (
            <Link href={`/dashboard/quotes/new?calc=${encodeURIComponent(calcParam)}&tier=${tier}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              Create quote from this list
            </Link>
          ) : null}
          <button onClick={() => window.print()} disabled={list.length === 0} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium disabled:opacity-50">
            Print for the customer
          </button>
        </div>
      </div>
    </div>
  );
}
