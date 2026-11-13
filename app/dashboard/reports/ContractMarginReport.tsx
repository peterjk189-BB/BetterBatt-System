"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Rate = { id: string; customer_id: string; part_id: string | null; builder_description: string; rate_per_m2: number; effective_from: string; sort_order: number };
type Part = { id: string; name: string; code: string | null; coverage_m2: number; pack_cost_ex_gst: number; installer_rate_per_m2: number };
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
        supabase.from("parts").select("id, name, code, coverage_m2, pack_cost_ex_gst, installer_rate_per_m2"),
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
        const costPack = (Number(p?.pack_cost_ex_gst) || 0) + (Number(p?.installer_rate_per_m2) || 0) * cov;
        const margin = sellPack > 0 ? (sellPack - costPack) / sellPack : 0;
        const needPack = costPack / (1 - t);
        const v = vol.get(r.id) ?? { m2: 0, packs: 0, rev: 0 };
        return { r, p, cov, sellPack, costPack, margin, needPack, needM2: cov > 0 ? needPack / cov : 0, v, cost: v.packs * costPack };
      });
  }, [rates, parts, lines, latestOnly, t]);

  const totals = useMemo(() => {
    const packs = rows.reduce((s, x) => s + x.v.packs, 0);
    const rev = rows.reduce((s, x) => s + x.v.rev, 0);
    const cost = rows.reduce((s, x) => s + x.cost, 0);
    const needRev = rows.reduce((s, x) => s + x.v.packs * x.needPack, 0);
    return { packs, rev, cost, margin: rev > 0 ? (rev - cost) / rev : 0, needRev };
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
            Per product on the builder&apos;s price list: what a pack sells for, what it costs (pack cost + installer rate) and the pack price needed to reach your target margin. Volumes are packs on Accepted / Complete jobs.
            Margin = profit ÷ sell price, the same as on the quote page.
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
            <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">Extra sales needed for {Number(target) || 0}%</div><div className="text-xl font-semibold">{money0(Math.max(0, totals.needRev - totals.rev))}</div></div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className={th}>Product</th>
                  <th className={th + " text-right"}>Packs sold</th>
                  <th className={th + " text-right"}>Cost / pack</th>
                  <th className={th + " text-right"}>Sell / pack</th>
                  <th className={th + " text-right"}>Margin</th>
                  <th className={th + " text-right"}>Pack price for {Number(target) || 0}%</th>
                  <th className={th + " text-right"}>= $/m²</th>
                  <th className={th + " text-right"}>Change</th>
                  <th className={th + " text-right"}>Sales</th>
                  <th className={th + " text-right"}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const change = x.sellPack > 0 ? x.needPack - x.sellPack : 0;
                  return (
                    <tr key={x.r.id} className="border-b border-[var(--border)]">
                      <td className={td}>
                        <div className="font-medium">{x.r.builder_description}</div>
                        <div className="text-xs text-[var(--muted)]">{x.p ? `${x.p.code ? x.p.code + " · " : ""}${x.p.name} · ${x.cov} m²/pack` : "No inventory item linked"}{!latestOnly ? ` · rates from ${x.r.effective_from}` : ""}</div>
                      </td>
                      <td className={td + " text-right tabular-nums"}>{x.v.packs ? x.v.packs.toLocaleString("en-AU") : "—"}</td>
                      <td className={td + " text-right tabular-nums"}>{money(x.costPack)}</td>
                      <td className={td + " text-right tabular-nums"}>{money(x.sellPack)}<div className="text-xs text-[var(--muted)]">{money(Number(x.r.rate_per_m2))}/m²</div></td>
                      <td className={td + " text-right font-semibold tabular-nums"} style={{ color: below(x.margin) ? "#b3261e" : "#1b7a3a" }}>{pct(x.margin)}</td>
                      <td className={td + " text-right font-semibold tabular-nums"}>{money(x.needPack)}</td>
                      <td className={td + " text-right tabular-nums"}>{money(x.needM2)}</td>
                      <td className={td + " text-right tabular-nums"} style={{ color: change > 0.005 ? "#b3261e" : "#1b7a3a" }}>{change > 0.005 ? "+" : ""}{money(change)}</td>
                      <td className={td + " text-right tabular-nums"}>{x.v.rev ? money0(x.v.rev) : "—"}</td>
                      <td className={td + " text-right tabular-nums"}>{x.v.rev ? money0(x.v.rev - x.cost) : "—"}</td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td className={td + " text-[var(--muted)]"} colSpan={10}>No contract rates for this builder.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className={td}>Total</td>
                  <td className={td + " text-right tabular-nums"}>{totals.packs.toLocaleString("en-AU")}</td>
                  <td className={td} colSpan={2}></td>
                  <td className={td + " text-right tabular-nums"} style={{ color: below(totals.margin) ? "#b3261e" : "#1b7a3a" }}>{pct(totals.margin)}</td>
                  <td className={td} colSpan={3}></td>
                  <td className={td + " text-right tabular-nums"}>{money0(totals.rev)}</td>
                  <td className={td + " text-right tabular-nums"}>{money0(totals.rev - totals.cost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Cost / pack = Inventory pack cost + installer rate × m² per pack (the same costs the quote page uses). &quot;Pack price for {Number(target) || 0}%&quot; = cost ÷ (1 − {Number(target) || 0}%). Change shows how much each pack&apos;s sell price must move. Contract rates are charged on plan m², so real margin on a job can differ slightly from the per-pack figure.
          </p>
        </>
      )}
    </div>
  );
}
