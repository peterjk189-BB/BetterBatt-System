"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import ForceLight from "@/app/ForceLight";
import { elementToPdf } from "@/lib/elementToPdf";
import { computeSalesReport, isoWeekOf, lastFinishedWeek, weeksInYear, weekRange, type SalesData, type SalesReport as Report } from "@/lib/salesReport";

// Literal colours (not CSS variables) so the charts come out the same in the PDF. The page is always light, like a printout.
const INK = "#201f1c";
const MUTED = "#6b6760";
const GRID = "#ebe8df";
const BLUE = "#2563eb";
const GOLD = "#b1841f";
const GREEN = "#3f8f3a";
const RED = "#c0392b";
const HEAD = "#fdb930"; // Better Batt gold, for the tile headers

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const plain = (n: number) => Math.round(n).toLocaleString("en-AU");
const short = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}m` : Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const dmy = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export default function SalesReport({
  data,
  initialTarget,
  targetSaved,
  errors,
}: {
  data: SalesData;
  initialTarget: number;
  targetSaved: boolean;
  errors: string[];
}) {
  const start = useMemo(() => lastFinishedWeek(new Date()), []);
  const current = useMemo(() => isoWeekOf(new Date()), []); // this week, part done: the latest week that can be picked
  const [year, setYear] = useState(start.year);
  const [week, setWeek] = useState(start.week);
  const [target, setTarget] = useState(initialTarget);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(initialTarget));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const r = useMemo(() => computeSalesReport(data, year, week, target), [data, year, week, target]);
  const years = useMemo(() => {
    const ys = new Set<number>([start.year, current.year]);
    for (const i of data.invoices) if (i.invoice_date) ys.add(Number(i.invoice_date.slice(0, 4)));
    return [...ys].filter((y) => y >= 2000 && y <= current.year).sort((a, b) => b - a);
  }, [data.invoices, start.year, current.year]);

  function move(by: number) {
    let y = year;
    let w = week + by;
    if (w < 1) {
      y -= 1;
      w = weeksInYear(y);
    } else if (w > weeksInYear(y)) {
      y += 1;
      w = 1;
    }
    if (y > current.year || (y === current.year && w > current.week)) return; // no future weeks (this week, part done, is allowed)
    setYear(y);
    setWeek(w);
  }

  async function saveTarget() {
    const n = Math.round(Number(draft.replace(/[$,\s]/g, "")));
    if (!Number.isFinite(n) || n <= 0) {
      setMsg("Enter a target above $0.");
      return;
    }
    setTarget(n);
    setEditing(false);
    setMsg("");
    if (!targetSaved) {
      setMsg("Target changed for now only. Run migration 0109 in Supabase so it is saved.");
      return;
    }
    const res = await fetch("/api/settings/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ annual_sales_target: n }) });
    if (!res.ok) setMsg(`The target could not be saved: ${(await res.json().catch(() => ({})))?.error ?? res.statusText}`);
  }

  async function pdf() {
    if (!printRef.current) return;
    setBusy(true);
    try {
      await elementToPdf(printRef.current, `sales-report-${year}-week-${week}.pdf`, "landscape");
    } finally {
      setBusy(false);
    }
  }

  const rng = weekRange(year, week);
  const isCurrent = year === current.year && week === current.week;
  const ahead = r.vsTarget !== null && r.vsTarget >= 0;

  return (
    <div className="space-y-3">
      <ForceLight />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => move(-1)} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm" aria-label="Previous week">←</button>
          <select value={week} onChange={(e) => setWeek(Number(e.target.value))} className="rounded-md border border-[var(--border)] px-2 py-1 text-sm">
            {Array.from({ length: weeksInYear(year) }, (_, i) => i + 1)
              .filter((w) => year < current.year || w <= current.week)
              .map((w) => (
                <option key={w} value={w}>Week {w}</option>
              ))}
          </select>
          <select
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              setYear(y);
              setWeek(y === start.year ? start.week : y === current.year ? current.week : weeksInYear(y));
            }}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => move(1)} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm" aria-label="Next week">→</button>
          <span className="text-sm text-[var(--muted)]">Mon {dmy(rng.mon)} to Sun {dmy(rng.sun)}{isCurrent ? " (this week, not finished)" : ""}</span>
        </div>
        <button onClick={pdf} disabled={busy} className="rounded-md bg-[#201f1c] px-3 py-1.5 text-sm font-medium text-white">
          {busy ? "Making PDF…" : "Download PDF"}
        </button>
      </div>

      {errors.length > 0 && (
        <p className="rounded-lg border border-[#f3d48a] bg-[#fff4d6] px-3 py-2 text-sm text-[#7a5a0f]">Some data could not be loaded, so figures may be low: {errors[0]}</p>
      )}
      {msg && <p className="rounded-lg border border-[#f3d48a] bg-[#fff4d6] px-3 py-2 text-sm text-[#7a5a0f] print:hidden">{msg}</p>}

      <div className="overflow-x-auto">
        <div ref={printRef} className="min-w-[1000px] bg-white p-3" style={{ color: INK }}>
          <div className="mb-2 flex items-baseline justify-between rounded px-3 py-2" style={{ background: BLUE, color: "#fff" }}>
            <h1 className="text-2xl font-bold">Sales Target / Revenue Dashboard {year}</h1>
            <span className="text-sm">Ex GST · Week {week}: {dmy(rng.mon)} to {dmy(rng.sun)}</span>
          </div>

          {/* Top row */}
          <div className="grid grid-cols-[2fr_7fr] gap-2">
            <div className="flex items-center justify-between rounded border px-3 py-1.5" style={{ borderColor: GRID, background: "#f4f3ef" }}>
              <span className="text-lg">Week</span>
              <b className="text-2xl tabular-nums">{week}</b>
            </div>
            <div className="flex items-center justify-between rounded px-3 py-1.5" style={{ background: HEAD }}>
              <span className="text-lg font-semibold">Weekly sales average</span>
              <span className="text-right">
                <b className="text-2xl tabular-nums">{plain(r.weeklyAverage)}</b>
                <span className="block text-xs">over {r.weeksWithSales} week{r.weeksWithSales === 1 ? "" : "s"} with sales</span>
              </span>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            <Tile big label="Total revenue" value={plain(r.ytd)} sub={`1 Jan to ${dmy(rng.sun)}`} />
            <Tile label="Week sales" value={plain(r.week_.sales)} sub={r.prevWeek ? `Last week ${plain(r.prevWeek.sales)}` : ""} />
            <Tile label="Cash sales" value={plain(r.week_.cashSales)} sub={r.prevWeek ? `Last week ${plain(r.prevWeek.cashSales)}` : ""} />
            <Tile label="Sales for week" value={String(r.week_.count)} sub="Invoices issued" />
            <Tile label="Private jobs complete" value={String(r.week_.privateJobs)} sub={r.prevWeek ? `Last week ${r.prevWeek.privateJobs}` : ""} />
            <Tile label="Quotes" value={String(r.week_.quotes.count)} sub={r.prevWeek ? `Last week ${r.prevWeek.quotes.count}` : ""} />
            <Tile label="Quote value" value={plain(r.week_.quotes.value)} sub={r.prevWeek ? `Last week ${plain(r.prevWeek.quotes.value)}` : ""} />
          </div>

          {/* Target + monthly + top 10 */}
          <div className="mt-2 grid grid-cols-[2fr_4fr_4fr] gap-2">
            <div className="flex flex-col gap-2">
              <div className="flex flex-1 flex-col justify-center rounded px-3 py-2" style={{ background: "#9fd46b" }}>
                <span className="text-sm font-semibold">Target revenue</span>
                {editing ? (
                  <span className="mt-1 flex gap-1 print:hidden">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveTarget()}
                      className="w-full rounded border px-2 py-1 text-right text-lg tabular-nums"
                    />
                    <button onClick={saveTarget} className="rounded bg-white px-2 text-sm font-medium">Save</button>
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setDraft(String(target));
                      setEditing(true);
                    }}
                    title="Change the target"
                    className="text-right text-3xl font-bold tabular-nums"
                  >
                    {plain(target)}
                  </button>
                )}
                <span className="text-right text-xs">for {year}{!editing && <span className="print:hidden"> · tap to change</span>}</span>
              </div>
              <div className="flex flex-1 flex-col justify-center rounded px-3 py-2 text-right" style={{ background: ahead ? "#d7f0c9" : "#f8c9c3" }}>
                <span className="text-left text-sm font-semibold">Revenue v target</span>
                <b className="text-3xl tabular-nums" style={{ color: ahead ? GREEN : RED }}>
                  {r.vsTarget === null ? "—" : `${r.vsTarget >= 0 ? "+" : ""}${Math.round(r.vsTarget)}%`}
                </b>
                <span className="text-xs">{money(Math.max(0, target - r.ytd))} still to reach target</span>
              </div>
            </div>
            <Card title="Monthly sales">
              <MonthlyChart rows={r.monthly.slice(0, r.lastMonth)} />
            </Card>
            <Card title="Top 10 customer sales" hint="Year to date">
              <TopCustomers rows={r.topCustomers} />
            </Card>
          </div>

          <Card title="Weekly sales" className="mt-2" hint={`Dashed line = weekly average ${short(r.weeklyAverage)}`}>
            <WeeklyChart weekly={r.weekly} average={r.weeklyAverage} selected={week} />
          </Card>
          <Card title="Cash sales count" className="mt-2" hint="Number of cash sales each week">
            <CashCountChart weekly={r.weekly} selected={week} />
          </Card>
          <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
            Sales are issued invoices ex GST by invoice date (drafts and voided invoices are not counted; credit notes reduce sales). Cash sales are stock items sold on
            invoices, leaving out deliveries to jobs that have a work order. Private jobs are work orders completed for customers who are not builders. Quotes are new quotes
            created in the week (revised quotes such as Q1125-A are not counted again).
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Tile({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className="rounded px-3 py-2" style={{ background: big ? "#f2a900" : HEAD }}>
      <b className="block text-right text-2xl tabular-nums">{value}</b>
      <span className="block text-right text-sm font-semibold">{label}</span>
      {sub ? <span className="block text-right text-[11px]">{sub}</span> : null}
    </div>
  );
}

function Card({ title, hint, className = "", children }: { title: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded border bg-white p-3 ${className}`} style={{ borderColor: GRID }}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {hint && <span className="text-xs" style={{ color: MUTED }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function MonthlyChart({ rows }: { rows: Report["monthly"] }) {
  const W = 460, H = 220, L = 44, R = 12, T = 18, B = 22;
  if (!rows.length) return <p className="text-sm" style={{ color: MUTED }}>No sales yet.</p>;
  const max = niceMax(Math.max(...rows.map((r) => r.sales), 1));
  const step = (W - L - R) / 12;
  const x = (i: number) => L + step * (i + 0.5);
  const y = (v: number) => T + (H - T - B) * (1 - Math.max(0, v) / max);
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Sales by month">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={L - 5} y={y(t) + 4} textAnchor="end" fontSize="10" fill={MUTED}>{short(t)}</text>
        </g>
      ))}
      <polyline fill="none" stroke={BLUE} strokeWidth="2" points={rows.map((r, i) => `${x(i)},${y(r.sales)}`).join(" ")} />
      {rows.map((r, i) => (
        <g key={r.label}>
          <circle cx={x(i)} cy={y(r.sales)} r="4" fill={BLUE} stroke="#fff" strokeWidth="2"><title>{`${r.label}: ${money(r.sales)}`}</title></circle>
          <text x={x(i)} y={y(r.sales) - 8} textAnchor="middle" fontSize="10" fill={INK}>{short(r.sales)}</text>
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={MUTED}>{r.label}</text>
        </g>
      ))}
    </svg>
  );
}

function TopCustomers({ rows }: { rows: Report["topCustomers"] }) {
  if (!rows.length) return <p className="text-sm" style={{ color: MUTED }}>No sales yet.</p>;
  const max = rows[0].sales;
  return (
    <div className="space-y-1">
      {rows.map((c) => (
        <div key={c.name} className="grid grid-cols-[150px_1fr_64px] items-center gap-2 text-xs" title={`${c.name}: ${money(c.sales)}`}>
          <span className="truncate text-right">{c.name}</span>
          <span className="h-3 rounded-r" style={{ width: `${Math.max(1, (c.sales / max) * 100)}%`, background: BLUE }} />
          <span className="text-right tabular-nums">{short(c.sales)}</span>
        </div>
      ))}
    </div>
  );
}

function WeeklyChart({ weekly, average, selected }: { weekly: Report["weekly"]; average: number; selected: number }) {
  const W = 1000, H = 200, L = 46, R = 12, T = 20, B = 22;
  const max = niceMax(Math.max(...weekly.map((w) => w.sales), 1));
  const step = (W - L - R) / Math.max(weekly.length, 1);
  const x = (i: number) => L + step * (i + 0.5);
  const y = (v: number) => T + (H - T - B) * (1 - Math.max(0, v) / max);
  const ticks = [0, max / 2, max];
  // Label the highest and lowest weeks with sales and the selected week; hover shows every week.
  const withSales = weekly.filter((w) => w.sales > 0);
  const hi = withSales.reduce<typeof weekly[number] | null>((a, w) => (!a || w.sales > a.sales ? w : a), null);
  const lo = withSales.reduce<typeof weekly[number] | null>((a, w) => (!a || w.sales < a.sales ? w : a), null);
  const labelled = new Set([hi?.week, lo?.week, selected]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Sales by week">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={L - 5} y={y(t) + 4} textAnchor="end" fontSize="10" fill={MUTED}>{short(t)}</text>
        </g>
      ))}
      {average > 0 && <line x1={L} x2={W - R} y1={y(average)} y2={y(average)} stroke={GOLD} strokeDasharray="5 4" />}
      <polyline fill="none" stroke={GREEN} strokeWidth="2" points={weekly.map((w, i) => `${x(i)},${y(w.sales)}`).join(" ")} />
      {weekly.map((w, i) => (
        <g key={w.week}>
          <rect x={x(i) - step / 2} y={T} width={step} height={H - T - B} fill="transparent"><title>{`Week ${w.week}: ${money(w.sales)}, ${w.count} invoice${w.count === 1 ? "" : "s"}`}</title></rect>
          <circle cx={x(i)} cy={y(w.sales)} r={w.week === selected ? 4.5 : 2.5} fill={w.week === selected ? INK : GREEN} pointerEvents="none" />
          {labelled.has(w.week) && (
            <text x={x(i)} y={y(w.sales) - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>{plain(w.sales)}</text>
          )}
          {(weekly.length <= 26 || w.week % 2 === 1 || w.week === selected) && (
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={w.week === selected ? INK : MUTED} fontWeight={w.week === selected ? 700 : 400}>{w.week}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function CashCountChart({ weekly, selected }: { weekly: Report["weekly"]; selected: number }) {
  const W = 1000, H = 150, L = 46, R = 12, T = 18, B = 22;
  const max = Math.max(5, ...weekly.map((w) => w.cashCount));
  const step = (W - L - R) / Math.max(weekly.length, 1);
  const x = (i: number) => L + step * (i + 0.5);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Number of cash sales by week">
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={GRID} />
      <polyline fill="none" stroke={GOLD} strokeWidth="2" points={weekly.map((w, i) => `${x(i)},${y(w.cashCount)}`).join(" ")} />
      {weekly.map((w, i) => (
        <g key={w.week}>
          <circle cx={x(i)} cy={y(w.cashCount)} r={w.week === selected ? 4.5 : 2.5} fill={w.week === selected ? INK : GOLD}>
            <title>{`Week ${w.week}: ${w.cashCount} cash sale${w.cashCount === 1 ? "" : "s"}, ${money(w.cashSales)}`}</title>
          </circle>
          <text x={x(i)} y={y(w.cashCount) - 7} textAnchor="middle" fontSize="10" fill={INK}>{w.cashCount}</text>
          {(weekly.length <= 26 || w.week % 2 === 1 || w.week === selected) && (
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={w.week === selected ? INK : MUTED} fontWeight={w.week === selected ? 700 : 400}>{w.week}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
