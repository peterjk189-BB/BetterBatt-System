"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Rate = { id: string; customer_id: string; part_id: string | null; builder_description: string; rate_per_m2: number; effective_from: string; sort_order: number };
type Part = { id: string; name: string; code: string | null; coverage_m2: number; pack_cost_ex_gst: number; installer_rate_per_m2: number; suppliers?: any };
type Cust = { id: string; name: string };

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const money0 = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function ContractMarginReport() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [rates, setRates] = useState<Rate[]>([]);
  const [parts, setParts] = useState<Record<string, Part>>({});
  const [lines, setLines] = useState<any[]>([]);
  const [target, setTarget] = useState("15");
  const [latestOnly, setLatestOnly] = useState(true);
  const [withLabour, setWithLabour] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Builders that have a contract price list.
  useEffect(() => {
    (async () => {
      const r: any = await supabase.from("customer_contract_rates").select("customer_id, customers(id, name)").eq("archived", false);
      if (r.error) {
        setError(r.error.message);
        setLoading(false);
        return;
      }
      const map = new Map<string, Cust>();
      for (const x of (r.data ?? []) as any[]) {
        const c = Array.isArray(x.customers) ? x.customers[0] : x.customers;
        if (c) map.set(c.id, { id: c.id, name: c.name });
      }
      const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      setCustomers(list);
      setCustomerId((list.find((c) => /maple/i.test(c.name)) ?? list[0])?.id ?? "");
      setLoading(false);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      setJobsLoading(true);
      setError("");
      const [rr, pp, ll]: any[] = await Promise.all([
        supabase.from("customer_contract_rates").select("*").eq("customer_id", customerId).eq("archived", false),
        supabase.from("parts").select("id, name, code, coverage_m2, pack_cost_ex_gst, installer_rate_per_m2, suppliers(name)"),
        supabase
          .from("project_lines")
          .select("qty_m2, part_id, contract_rate, contract_rate_id, option_key, projects!inner(customer_id, archived, outcome, option_accepted)")
          .eq("projects.customer_id", customerId)
          .eq("projects.archived", false)
          .not("contract_rate", "is", null),
      ]);
      if (rr.error || pp.error || ll.error) setError((rr.error || pp.error || ll.error).message);
      setRates((rr.data ?? []) as Rate[]);
      const pm: Record<string, Part> = {};
      for (const p of (pp.data ?? []) as any[]) pm[p.id] = p;
      setParts(pm);
      setLines((ll.data ?? []) as any[]);
      setJobsLoading(false);
    })();
  }, [supabase, customerId]);

  const t = Math.min(Math.max(Number(target) || 0, 0), 95) / 100;

  const rows = useMemo(() => {
    const dates = Array.from(new Set(rates.map((r) => r.effective_from))).sort();
    const latest = dates[dates.length - 1];
    // Volume sold per contract rate line: only jobs that were Accepted / Complete, and accepted options.
    const vol = new Map<string, { m2: number; packs: number; rev: number }>();
    for (const l of lines) {
      const pr = Array.isArray(l.projects) ? l.projects[0] : l.projects;
      if (!pr || !(pr.outcome === "Accepted" || pr.outcome === "Complete")) continue;
      if (l.option_key && !(pr.option_accepted ?? []).includes(l.option_key)) continue;
      const key = l.contract_rate_id || `part:${l.part_id}`;
      const part = parts[l.part_id];
      const m2 = Number(l.qty_m2) || 0;
      const packs = part && part.coverage_m2 > 0 ? Math.ceil(m2 / part.coverage_m2) : 0;
      const v = vol.get(key) ?? { m2: 0, packs: 0, rev: 0 };
      v.m2 += m2;
      v.packs += packs;
      v.rev += m2 * (Number(l.contract_rate) || 0);
      vol.set(key, v);
    }
    return rates
      .filter((r) => (latestOnly ? r.effective_from === latest : true))
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : a.sort_order - b.sort_order))
      .map((r) => {
        const p = r.part_id ? parts[r.part_id] : undefined;
        const cov = Number(p?.coverage_m2) || 0;
        const sellPack = Number(r.rate_per_m2) * cov;
        const buy = Number(p?.pack_cost_ex_gst) || 0;
        const labourPack = withLabour ? (Number(p?.installer_rate_per_m2) || 0) * cov : 0;
        const costPack = buy + labourPack;
        const margin = sellPack > 0 ? (sellPack - costPack) / sellPack : 0;
        // Sell price is fixed: the most we can pay the supplier per pack to still make the target margin.
        const maxBuy = sellPack * (1 - t) - labourPack;
        const cut = buy - maxBuy;
        const v = vol.get(r.id) ?? { m2: 0, packs: 0, rev: 0 };
        const sup = Array.isArray(p?.suppliers) ? p?.suppliers[0]?.name : p?.suppliers?.name;
        return { r, p, cov, sellPack, buy, labourPack, costPack, margin, maxBuy, cut, cutPct: buy > 0 ? cut / buy : 0, sup: sup || "—", v, cost: v.packs * costPack, saving: Math.max(0, cut) * v.packs };
      });
  }, [rates, parts, lines, latestOnly, t, withLabour]);

  const totals = useMemo(() => {
    const packs = rows.reduce((x, y) => x + y.v.packs, 0);
    const rev = rows.reduce((x, y) => x + y.v.rev, 0);
    const cost = rows.reduce((x, y) => x + y.cost, 0);
    const saving = rows.reduce((x, y) => x + y.saving, 0);
    return { packs, rev, cost, margin: rev > 0 ? (rev - cost) / rev : 0, saving };
  }, [rows]);

  const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]";
  const td = "px-2 py-1.5 align-top";
  const below = (m: number) => m < t - 0.0005;

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Contract pricing margins</h2>
          <p className="text-xs text-[var(--muted)]">
            Contractor sell prices stay as they are. For each product this shows the most we can pay the supplier per pack to still make the target margin, and how far that is from what we pay now.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select className="rounded-lg border border-[var(--border)] px-2 py-1.5" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            Target margin
            <input className="w-16 rounded border border-[var(--border)] px-2 py-1 text-right" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />%
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} /> Latest rates only
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={withLabour} onChange={(e) => setWithLabour(e.target.checked)} /> Include installer cost
          </label>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {loading || jobsLoading ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>
      ) : !customers.length ? (
        <p className="mt-4 text-sm text-[var(--muted)]">No builder has a contract price list yet.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Packs sold</div><div className="text-xl font-semibold">{totals.packs.toLocaleString("en-AU")}</div></div>
            <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Sales (ex GST)</div><div className="text-xl font-semibold">{money0(totals.rev)}</div></div>
            <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Current margin</div><div className="text-xl font-semibold" style={{ color: below(totals.margin) ? "#b3261e" : undefined }}>{pct(totals.margin)}</div></div>
            <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Supplier saving needed (on packs sold)</div><div className="text-xl font-semibold">{money0(totals.saving)}</div></div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={th}>Product</th>
                  <th className={th}>Supplier</th>
                  <th className={th + " text-right"}>Packs sold</th>
                  <th className={th + " text-right"}>Maple rate /m²</th>
                  <th className={th + " text-right"}>Pack cost now /m²</th>
                  <th className={th + " text-right"}>Installer /m²</th>
                  <th className={th + " text-right"}>Margin now</th>
                  <th className={th + " text-right"}>Must pay ≤ /m² ({Number(target) || 0}%)</th>
                  <th className={th + " text-right"}>= per pack</th>
                  <th className={th + " text-right"}>Cut per pack</th>
                  <th className={th + " text-right"}>Cut %</th>
                  <th className={th + " text-right"}>Saving on packs sold</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const ok = x.cut <= 0.005;
                  const c = x.cov || 1;
                  return (
                    <tr key={x.r.id} className="border-b border-[var(--border)]">
                      <td className={td}>
                        <div className="font-medium">{x.r.builder_description}</div>
                        <div className="text-xs text-[var(--muted)]">{x.p ? `${x.p.code ? x.p.code + " · " : ""}${x.p.name} · ${x.cov} m²/pack` : "No inventory item linked"}{!latestOnly ? ` · rates from ${x.r.effective_from}` : ""}</div>
                      </td>
                      <td className={td}>{x.sup}</td>
                      <td className={td + " text-right tabular-nums"}>{x.v.packs ? x.v.packs.toLocaleString("en-AU") : "—"}</td>
                      <td className={td + " text-right tabular-nums"}>{money(Number(x.r.rate_per_m2))}</td>
                      <td className={td + " text-right tabular-nums"}>{money(x.buy / c)}<div className="text-xs text-[var(--muted)]">{money(x.buy)} ÷ {x.cov} m²</div></td>
                      <td className={td + " text-right tabular-nums"}>{x.labourPack ? money(x.labourPack / c) : "—"}</td>
                      <td className={td + " text-right font-semibold tabular-nums"} style={{ color: below(x.margin) ? "#b3261e" : "#1b7a3a" }}>{pct(x.margin)}</td>
                      <td className={td + " text-right font-bold tabular-nums"}>{money(x.maxBuy / c)}</td>
                      <td className={td + " text-right font-bold tabular-nums"}>{money(x.maxBuy)}</td>
                      <td className={td + " text-right tabular-nums"} style={{ color: ok ? "#1b7a3a" : "#b3261e" }}>{ok ? "OK" : "−" + money(x.cut)}</td>
                      <td className={td + " text-right tabular-nums"} style={{ color: ok ? "#1b7a3a" : "#b3261e" }}>{ok ? "—" : pct(x.cutPct)}</td>
                      <td className={td + " text-right tabular-nums"}>{x.saving ? money0(x.saving) : "—"}</td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td className={td + " text-[var(--muted)]"} colSpan={12}>No contract rates for this builder.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className={td} colSpan={2}>Total</td>
                  <td className={td + " text-right tabular-nums"}>{totals.packs.toLocaleString("en-AU")}</td>
                  <td className={td} colSpan={3}></td>
                  <td className={td + " text-right tabular-nums"} style={{ color: below(totals.margin) ? "#b3261e" : "#1b7a3a" }}>{pct(totals.margin)}</td>
                  <td className={td} colSpan={4}></td>
                  <td className={td + " text-right tabular-nums"}>{money0(totals.saving)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Must pay ≤ per m² = the contract rate (fixed) × (1 − {Number(target) || 0}%) − installer rate per m². Per pack = that × m² per pack, the target ex-GST pack price for the supplier. Cut % is the discount needed off today&apos;s Inventory pack cost. Packs sold counts Accepted / Complete jobs only.
          </p>
        </>
      )}
    </div>
  );
}
