"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { computeStats, type BData, type Period, type Stats } from "@/lib/businessStats";

const INK = "#201f1c";
const GOLD = "#b1841f";
const BRONZE = "#8a5a2b";
const BLUE = "#2563eb";
const GOOD = "#1f7a3d";
const WARN = "#a8680f";
const BAD = "#b3261e";
const GRID = "#ebe8df";
const MUTED = "#6b6862";

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const short = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}m` : Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const pct = (n: number | null, d = 1) => (n === null ? "—" : `${n.toFixed(d)}%`);

const TARGET_KEY = "bb-target-margin";

export default function BusinessDashboard({ data, errors }: { data: BData; errors: string[] }) {
  const [period, setPeriod] = useState<Period>("year");
  const [target, setTarget] = useState(30);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(TARGET_KEY));
      if (v > 0 && v < 100) setTarget(v);
    } catch {}
  }, []);
  function changeTarget(v: number) {
    setTarget(v);
    try {
      localStorage.setItem(TARGET_KEY, String(v));
    } catch {}
  }

  const s = useMemo(() => computeStats(data, period, new Date()), [data, period]);
  const marginOk = s.margin !== null && s.margin >= target;

  const seg = (p: Period, label: string) => (
    <button
      key={p}
      onClick={() => setPeriod(p)}
      className={`rounded-md px-3 py-1 text-sm ${period === p ? "bg-[#201f1c] text-white" : "text-[var(--muted)]"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Business Dashboard</h1>
          <p className="text-sm text-[var(--muted)]">{s.label}. Sales are ex GST. Costs are materials picked and contractor task pay.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
          {seg("month", "This month")}
          {seg("quarter", "Quarter")}
          {seg("year", "Financial year")}
        </div>
      </div>

      {errors.length > 0 && (
        <p className="rounded-lg border border-[#f3d48a] bg-[#fff4d6] px-3 py-2 text-sm text-[#7a5a0f]">
          Some data could not be loaded, so figures may be low: {errors[0]}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sales invoiced" value={money(s.sales)} sub="Sent invoices, ex GST" />
        <Kpi label="Gross profit" value={money(s.profit)} sub="Sales less materials and contractors" tone={s.profit >= 0 ? GOOD : BAD} />
        <Kpi label="Margin" value={pct(s.margin)} sub={`Target ${target}%`} tone={s.margin === null ? undefined : marginOk ? GOOD : BAD} />
        <Kpi label="Cash collected" value={money(s.cashIn)} sub="Payments received, inc GST" />
        <Kpi label="Owed to us" value={money(s.owedTotal)} sub={`${money(s.overdueTotal)} overdue`} tone={s.overdueTotal > 0 ? BAD : undefined} />
        <Kpi label="Quote win rate" value={pct(s.winRate, 0)} sub={s.decidedCount ? `${s.wonCount} of ${s.decidedCount} decided` : "No decided quotes"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8" title="Sales, costs and profit" hint="Last 12 months">
          <Trend rows={s.trend} />
          <Legend items={[["Sales invoiced", GOLD], ["Materials + contractors", BRONZE], ["Gross profit", INK]]} />
        </Card>
        <Card className="lg:col-span-4" title="Quote to cash" hint={s.label}>
          <Funnel s={s} />
        </Card>

        <Card className="lg:col-span-5" title="Who owes us" hint="Unpaid invoices inc GST, by age past due">
          <Ageing s={s} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--muted)]">
                <tr><th className="py-1">Customer</th><th>Invoice</th><th className="text-right">Owing</th><th className="pl-3">Status</th></tr>
              </thead>
              <tbody>
                {s.topOwing.length === 0 && <tr><td colSpan={4} className="py-3 text-[var(--muted)]">Nothing outstanding.</td></tr>}
                {s.topOwing.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)]">
                    <td className="py-1.5">{r.customer}</td>
                    <td><Link className="text-accent hover:underline" href={`/dashboard/invoices/${r.id}`}>INV-{r.number}</Link></td>
                    <td className="text-right tabular-nums">{money(r.owing)}</td>
                    <td className="pl-3">
                      <Pill tone={r.daysLate > 30 ? "bad" : r.daysLate > 0 ? "warn" : "blue"}>
                        {r.daysLate > 0 ? `Overdue ${r.daysLate}d` : r.part ? "Part paid" : "Not due"}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card
          className="lg:col-span-7"
          title="Margin by job type"
          hint={`Accepted quotes, ${s.label}`}
          right={
            <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
              Target
              <input
                type="number"
                min={1}
                max={99}
                value={target}
                onChange={(e) => changeTarget(Math.min(99, Math.max(1, Number(e.target.value) || 30)))}
                className="w-14 rounded border border-[var(--border)] px-1.5 py-0.5 text-right text-sm text-[#201f1c]"
              />
              %
            </label>
          }
        >
          <Margins rows={s.marginByType} target={target} />
        </Card>

        <Card className="lg:col-span-7" title="Top customers" hint={`Accepted quotes, ${s.label}. Sales are quoted value ex GST.`}>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-xs uppercase text-[var(--muted)]">
                <tr><th className="py-1">Customer</th><th className="text-right">Jobs</th><th className="text-right">Sales</th><th className="text-right">Profit</th><th className="text-right">Margin</th></tr>
              </thead>
              <tbody>
                {s.topCustomers.length === 0 && <tr><td colSpan={5} className="py-3 text-[var(--muted)]">No accepted quotes in this period.</td></tr>}
                {s.topCustomers.map((c) => {
                  const m = c.revenue > 0 ? (c.profit / c.revenue) * 100 : null;
                  return (
                    <tr key={c.name} className="border-t border-[var(--border)]">
                      <td className="py-1.5">{c.name}</td>
                      <td className="text-right tabular-nums">{c.jobs}</td>
                      <td className="text-right tabular-nums">{money(c.revenue)}</td>
                      <td className="text-right tabular-nums">{money(c.profit)}</td>
                      <td className="text-right"><Pill tone={m === null ? "blue" : m >= target ? "good" : m >= target - 7 ? "warn" : "bad"}>{pct(m, 0)}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="lg:col-span-5" title="Needs attention" hint="Click a line to fix it">
          <Attention s={s} />
        </Card>

        <Card className="lg:col-span-6" title="Stock on hand by supplier" hint="At pack cost, ex GST">
          {s.stock.length === 0 ? <p className="text-sm text-[var(--muted)]">No stock recorded.</p> : (
            <div className="space-y-2.5">
              {s.stock.map((x) => (
                <div key={x.name}>
                  <div className="flex justify-between text-sm"><span>{x.name}</span><span className="tabular-nums">{money(x.value)}</span></div>
                  <Bar value={x.value} max={s.stock[0].value} color={GOLD} />
                </div>
              ))}
              <p className="text-xs text-[var(--muted)]">Total on hand {money(s.stockTotal)}.</p>
            </div>
          )}
        </Card>
        <Card className="lg:col-span-6" title="Cash going out" hint="Not yet paid">
          <div className="divide-y divide-[var(--border)] text-sm">
            <Row label="Contractors owed (finished tasks)" value={money(s.cashOut.contractorsOwed)} href="/dashboard/contractor-payments" />
            <Row label="Purchase orders placed, awaiting delivery" value={money(s.cashOut.poOrdered)} href="/dashboard/purchase-orders" />
            <Row label="Draft purchase orders not yet placed" value={money(s.cashOut.poDraft)} href="/dashboard/purchase-orders" />
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">Overheads, wages and tax are not in the app, so profit here is gross profit only.</p>
        </Card>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={tone ? { color: tone } : undefined}>{value}</p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>
    </div>
  );
}

function Card({ title, hint, right, className = "", children }: { title: string; hint?: string; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-xl border border-[var(--border)] bg-white p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h2>
          {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "blue"; children: ReactNode }) {
  const c = { good: "bg-[#e6f4ea] text-[#1f6b35]", warn: "bg-[#fff4d6] text-[#7a5a0f]", bad: "bg-[#fde8e8] text-[#b91c1c]", blue: "bg-[#e8effd] text-[#1e40af]" }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
      {items.map(([l, c]) => (
        <span key={l}><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-[-1px]" style={{ background: c }} />{l}</span>
      ))}
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="mt-1 h-2 overflow-hidden rounded bg-[#ebe8df]">
      <div className="h-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#faf8f4]">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

/* ---------- charts ---------- */

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function Trend({ rows }: { rows: Stats["trend"] }) {
  const W = 760, H = 250, L = 46, B = 26, T = 12, R = 8;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.sales, r.costs)), 1));
  const x = (i: number) => L + ((W - L - R) * (i + 0.5)) / rows.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const bw = ((W - L - R) / rows.length) * 0.34;
  const ticks = [0, max / 3, (max * 2) / 3, max];
  const pts = rows.map((r, i) => [x(i), y(Math.max(0, r.sales - r.costs))]);
  const last = pts[pts.length - 1];
  const lastProfit = rows[rows.length - 1].sales - rows[rows.length - 1].costs;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Monthly sales, costs and profit for the last 12 months">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{short(t)}</text>
        </g>
      ))}
      {rows.map((r, i) => (
        <g key={i}>
          <rect x={x(i) - bw - 1} y={y(r.sales)} width={bw} height={Math.max(0, y(0) - y(r.sales))} rx="2" fill={GOLD}><title>{`${r.label} sales ${money(r.sales)}`}</title></rect>
          <rect x={x(i) + 1} y={y(r.costs)} width={bw} height={Math.max(0, y(0) - y(r.costs))} rx="2" fill={BRONZE}><title>{`${r.label} costs ${money(r.costs)}`}</title></rect>
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={MUTED}>{r.label}</text>
        </g>
      ))}
      <polyline fill="none" stroke={INK} strokeWidth="2" points={pts.map((p) => p.join(",")).join(" ")} />
      <circle cx={last[0]} cy={last[1]} r="4" fill={INK} />
      <text x={last[0] - 8} y={Math.max(14, last[1] - 9)} textAnchor="end" fontSize="11" fontWeight="600" fill={INK}>{short(lastProfit)} profit</text>
    </svg>
  );
}

function Funnel({ s }: { s: Stats }) {
  const rows: [string, number, string][] = [
    ["Quotes raised", s.funnel.quotes, BLUE],
    ["Accepted", s.funnel.accepted, GOLD],
    ["Invoiced", s.funnel.invoiced, BRONZE],
    ["Fully paid", s.funnel.paid, GOOD],
  ];
  const top = Math.max(s.funnel.quotes, 1);
  return (
    <div className="space-y-3">
      {rows.map(([l, v, c], i) => (
        <div key={l}>
          <div className="flex items-baseline justify-between"><span className="text-sm">{l}</span><b className="text-xl tabular-nums">{v}</b></div>
          <Bar value={v} max={top} color={c} />
          {i > 0 && rows[i - 1][1] > 0 && <p className="text-xs text-[var(--muted)]">{Math.round((v / rows[i - 1][1]) * 100)}% of the step before</p>}
        </div>
      ))}
      <p className="text-xs text-[var(--muted)]">
        Average days from invoice to fully paid: <b className="text-[#201f1c]">{s.avgPayDays ?? "—"}</b>
      </p>
    </div>
  );
}

function Ageing({ s }: { s: Stats }) {
  const b = s.buckets;
  const parts: [string, number, string, number][] = [
    ["Not yet due", b.notDue, BLUE, 1],
    ["1 to 30 days", b.d1_30, WARN, 1],
    ["31 to 60 days", b.d31_60, BAD, 0.7],
    ["Over 60 days", b.d60, BAD, 1],
  ];
  const tot = parts.reduce((a, p) => a + p[1], 0);
  if (tot <= 0) return <p className="text-sm text-[var(--muted)]">No unpaid invoices.</p>;
  return (
    <>
      <div className="flex h-5 gap-0.5 overflow-hidden rounded">
        {parts.filter((p) => p[1] > 0).map(([l, v, c, o]) => (
          <span key={l} title={`${l} ${money(v)}`} style={{ width: `${(v / tot) * 100}%`, background: c, opacity: o }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        {parts.map(([l, v, c, o]) => (
          <span key={l}><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c, opacity: o }} />{l} {short(v)}</span>
        ))}
      </div>
    </>
  );
}

function Margins({ rows, target }: { rows: Stats["marginByType"]; target: number }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--muted)]">No accepted quotes in this period.</p>;
  const W = 560, rowH = 34, L = 200, R = 40;
  const H = rows.length * rowH + 20;
  const max = Math.max(45, target + 10, ...rows.map((r) => r.margin));
  const x = (v: number) => L + ((W - L - R) * Math.max(0, v)) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Margin by job type">
      {rows.map((r, i) => {
        const y = i * rowH + 4;
        const c = r.margin >= target ? GOOD : r.margin >= target - 7 ? WARN : BAD;
        const name = r.type.length > 30 ? r.type.slice(0, 29) + "…" : r.type;
        return (
          <g key={r.type}>
            <text x={L - 8} y={y + 17} textAnchor="end" fontSize="12" fill={INK}>{name}</text>
            <rect x={L} y={y + 4} width={Math.max(2, x(r.margin) - L)} height="18" rx="3" fill={c}><title>{`${r.type}: ${r.margin.toFixed(1)}% on ${money(r.revenue)} sales, ${r.jobs} job(s)`}</title></rect>
            <text x={x(r.margin) + 6} y={y + 18} fontSize="12" fontWeight="600" fill={INK}>{r.margin.toFixed(0)}%</text>
          </g>
        );
      })}
      <line x1={x(target)} x2={x(target)} y1="0" y2={H - 14} stroke={INK} strokeDasharray="4 4" />
      <text x={x(target) + 4} y={H - 3} fontSize="11" fill={INK}>target {target}%</text>
    </svg>
  );
}

function Attention({ s }: { s: Stats }) {
  const a = s.attention;
  const items: { label: string; value: string; href: string; hot: boolean; sub: string }[] = [
    { label: "Open jobs waiting on SWMS", value: String(a.waitingSwms), href: "/dashboard/reports", hot: a.waitingSwms > 0, sub: "Reports, Jobs & SWMS tab" },
    { label: "Failed inspections to re-inspect", value: String(a.reinspect), href: "/dashboard/work-orders", hot: a.reinspect > 0, sub: "Work orders" },
    { label: "Invoices overdue", value: String(a.overdue), href: "/dashboard/invoices", hot: a.overdue > 0, sub: "Invoices" },
    { label: "Accepted quotes with no invoice", value: String(a.acceptedNoInvoice), href: "/dashboard/quotes", hot: a.acceptedNoInvoice > 0, sub: "Quotes" },
    { label: "Draft purchase orders to place", value: String(a.draftPos), href: "/dashboard/purchase-orders", hot: false, sub: "Purchase orders" },
    { label: "Insurance expiring within 30 days", value: String(a.insuranceSoon), href: "/dashboard/subcontractors", hot: a.insuranceSoon > 0, sub: "Subcontractors" },
    { label: "Contractor pay not yet paid", value: money(a.contractorsOwed), href: "/dashboard/contractor-payments", hot: false, sub: "Contractor payments" },
  ];
  return (
    <div className="divide-y divide-[var(--border)]">
      {items.map((i) => (
        <Link key={i.label} href={i.href} className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#faf8f4]">
          <span className="text-sm">{i.label}<br /><span className="text-xs text-[var(--muted)]">{i.sub}</span></span>
          <b className="text-xl tabular-nums" style={{ color: i.hot ? BAD : i.value === "0" ? "#9a968c" : INK }}>{i.value}</b>
        </Link>
      ))}
    </div>
  );
}
