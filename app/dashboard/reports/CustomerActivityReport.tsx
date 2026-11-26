"use client";

// Reports › Customer activity: a list of customers (searchable, filter by type) and a drill-down
// for one customer — totals, win rate trend, quote history, open quotes to chase and products quoted.

import Link from "next/link";
import { useMemo, useState } from "react";
import { quoteLabel } from "@/lib/quoteLabel";
import { tierLabel } from "@/lib/priceTiers";
import { type Project, type ProjectLine, inRange, fmtCurrency, DateFilter, useDateRange, computeProjectValue, toDateOnly } from "./reportShared";

export type ReportCustomer = {
  id: string;
  name: string;
  category: "Builder" | "Retro Fit" | "Private" | string;
  price_tier?: string | null;
  payment_terms?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  last_contact_at?: string | null;
  created_at?: string | null;
  archived?: boolean;
};

type Inv = { id: string; customer_id: string | null; project_id: string | null; kind: string; total: number; status: string; invoice_date: string };
type Pay = { invoice_id: string; amount: number };

type Props = {
  projects: Project[];
  projectLines: ProjectLine[];
  customers: ReportCustomer[];
  invoices: Inv[];
  payments: Pay[];
};

/** One quote with its worked-out value and job m² (stock products only, like the work order). */
type QuoteRow = { p: Project; value: number; m2: number; sent: string };

const isWon = (o: string) => o === "Accepted" || o === "Complete";
const isRevised = (o: string) => o === "Superseded";

const OUTCOME_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800",
  Accepted: "bg-green-100 text-green-800",
  Complete: "bg-emerald-200 text-emerald-900",
  Lost: "bg-red-100 text-red-800",
  Cancelled: "bg-gray-200 text-gray-700",
  Superseded: "bg-amber-100 text-amber-800",
};
const outcomeLabel = (o: string) => (o === "Superseded" ? "Revised" : o);

const CATEGORY_COLORS: Record<string, string> = {
  Builder: "bg-blue-100 text-blue-800",
  "Retro Fit": "bg-green-100 text-green-800",
  Private: "bg-gray-200 text-gray-700",
};

/** dd/mm/yyyy */
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

function daysBetween(fromISO: string, toISO: string) {
  const a = new Date(fromISO.slice(0, 10) + "T00:00:00").getTime();
  const b = new Date(toISO.slice(0, 10) + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

function winRate(won: number, lost: number) {
  return won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
}

function fmtK(n: number) {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (Math.abs(n) >= 10000) return `$${Math.round(n / 1000)}k`;
  return fmtCurrency(n);
}

export default function CustomerActivityReport({ projects, projectLines, customers, invoices, payments }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const linesByProject = useMemo(() => {
    const m = new Map<string, ProjectLine[]>();
    for (const l of projectLines) {
      if (!m.has(l.project_id)) m.set(l.project_id, []);
      m.get(l.project_id)!.push(l);
    }
    return m;
  }, [projectLines]);

  const quoteRows = useMemo(
    () =>
      projects
        .filter((p) => !p.archived)
        .map((p): QuoteRow => {
          const lines = linesByProject.get(p.id) || [];
          const m2 = lines.reduce((s, l) => s + (l.parts && Number(l.parts.coverage_m2) > 0 ? Number(l.qty_m2) || 0 : 0), 0);
          return { p, value: computeProjectValue(p, lines), m2, sent: (p.emailed_at || p.entry_date || "").slice(0, 10) };
        }),
    [projects, linesByProject]
  );

  const customersById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  if (selectedId) {
    const customer = customersById.get(selectedId);
    return (
      <CustomerDetail
        customerId={selectedId}
        customer={customer}
        fallbackName={quoteRows.find((r) => r.p.customer_id === selectedId)?.p.customers?.name || "Customer"}
        allRows={quoteRows}
        linesByProject={linesByProject}
        invoices={invoices}
        payments={payments}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return <CustomerList rows={quoteRows} customersById={customersById} onOpen={setSelectedId} />;
}

// ---------------------------------------------------------------------------
// List of customers
// ---------------------------------------------------------------------------

function CustomerList({
  rows,
  customersById,
  onOpen,
}: {
  rows: QuoteRow[];
  customersById: Map<string, ReportCustomer>;
  onOpen: (id: string) => void;
}) {
  const { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range } = useDateRange();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("All");

  const table = useMemo(() => {
    const q = search.trim().toLowerCase();
    type Row = { id: string | null; name: string; contact: string; category: string; quotes: number; accepted: number; lost: number; open: number; totalValue: number; acceptedValue: number; openValue: number; last: string };
    const byCustomer = new Map<string, Row>();
    const matched = new Set<string>();
    for (const r of rows) {
      const p = r.p;
      // A revised quote (Q1125 replaced by Q1125-A) isn't counted again: only the latest version is.
      if (isRevised(p.outcome)) continue;
      if (!inRange((p.entry_date || "").slice(0, 10), range.start, range.end)) continue;
      const c = p.customer_id ? customersById.get(p.customer_id) : undefined;
      const category = c?.category || "—";
      if (cat !== "All" && category !== cat) continue;
      const key = p.customer_id || "none";
      if (!byCustomer.has(key)) {
        byCustomer.set(key, {
          id: p.customer_id,
          name: c?.name || p.customers?.name || "No customer",
          contact: c?.contact_name || "",
          category,
          quotes: 0, accepted: 0, lost: 0, open: 0, totalValue: 0, acceptedValue: 0, openValue: 0, last: "",
        });
      }
      const row = byCustomer.get(key)!;
      row.quotes += 1;
      row.totalValue += r.value;
      if (isWon(p.outcome)) { row.accepted += 1; row.acceptedValue += r.value; }
      else if (p.outcome === "Lost") row.lost += 1;
      else if (p.outcome === "Open") { row.open += 1; row.openValue += r.value; }
      if ((p.entry_date || "") > row.last) row.last = (p.entry_date || "").slice(0, 10);
      if (q) {
        const hay = [row.name, row.contact, c?.contact_email, c?.contact_phone, quoteLabel(p), p.address, p.suburb].join(" ").toLowerCase();
        if (hay.includes(q)) matched.add(key);
      }
    }
    return Array.from(byCustomer.entries())
      .filter(([k]) => !q || matched.has(k))
      .map(([, v]) => v)
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [rows, customersById, range.start, range.end, search, cat]);

  const totals = table.reduce(
    (s, r) => ({ quotes: s.quotes + r.quotes, value: s.value + r.totalValue, won: s.won + r.acceptedValue, open: s.open + r.openValue, a: s.a + r.accepted, l: s.l + r.lost }),
    { quotes: 0, value: 0, won: 0, open: 0, a: 0, l: 0 }
  );
  const overallRate = winRate(totals.a, totals.l);

  const catBtn = (c: string, label: string) => (
    <button
      onClick={() => setCat(c)}
      className={`rounded-lg px-3 py-1.5 text-sm ${cat === c ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Quotes raised per customer, by entry date (inc. GST). Revised quotes count once, as their latest version. Click a customer to see their full activity.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, contact, quote # or site address…"
          className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {catBtn("All", "All")}
          {catBtn("Builder", "Builders")}
          {catBtn("Retro Fit", "Retro fit")}
          {catBtn("Private", "Private")}
        </div>
      </div>
      <div className="mt-3">
        <DateFilter preset={preset} setPreset={setPreset} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <Tile label="Quotes" value={String(totals.quotes)} />
        <Tile label="Total quoted value" value={fmtCurrency(totals.value)} />
        <Tile label="Accepted value" value={fmtCurrency(totals.won)} />
        <Tile label="Open value" value={fmtCurrency(totals.open)} />
        <Tile label="Win rate" value={overallRate === null ? "—" : `${overallRate}%`} sub="Accepted ÷ (accepted + lost)" />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Quotes</th>
              <th className="px-3 py-2 text-right">Accepted</th>
              <th className="px-3 py-2 text-right">Lost</th>
              <th className="px-3 py-2 text-right">Open</th>
              <th className="px-3 py-2 text-right">Win %</th>
              <th className="px-3 py-2 text-right">Total value</th>
              <th className="px-3 py-2 text-right">Accepted value</th>
              <th className="px-3 py-2 text-right">Open value</th>
              <th className="px-3 py-2">Last quote</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => {
              const rate = winRate(r.accepted, r.lost);
              return (
                <tr key={r.id || "none"} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    {r.id ? (
                      <button onClick={() => onOpen(r.id!)} className="text-left font-medium text-accent hover:underline">
                        {r.name}
                      </button>
                    ) : (
                      <span className="font-medium">{r.name}</span>
                    )}
                    {r.contact && <div className="text-xs text-[var(--muted)]">{r.contact}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {r.category !== "—" && <span className={`rounded-full px-2 py-0.5 text-xs ${CATEGORY_COLORS[r.category] || "bg-gray-200 text-gray-700"}`}>{r.category}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{r.quotes}</td>
                  <td className="px-3 py-2 text-right">{r.accepted}</td>
                  <td className="px-3 py-2 text-right">{r.lost}</td>
                  <td className="px-3 py-2 text-right">{r.open}</td>
                  <td className={`px-3 py-2 text-right font-medium ${rate !== null && rate < 30 ? "text-[var(--bb-bad)]" : ""}`}>{rate === null ? "—" : `${rate}%`}</td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(r.totalValue)}</td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(r.acceptedValue)}</td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(r.openValue)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.last)}</td>
                </tr>
              );
            })}
            {table.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-[var(--muted)]">
                  {search ? "No customers match that search in this period." : "No quotes in this period."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" | "blue" }) {
  const color = tone === "good" ? "text-[var(--bb-good)]" : tone === "warn" ? "text-[var(--bb-warn)]" : tone === "bad" ? "text-[var(--bb-bad)]" : tone === "blue" ? "text-accent" : "";
  return (
    <div className="min-w-[150px] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="text-xs uppercase text-[var(--muted)]">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One customer
// ---------------------------------------------------------------------------

type StatusFilter = "All" | "Open" | "Won" | "Lost" | "Revised";

function CustomerDetail({
  customerId,
  customer,
  fallbackName,
  allRows,
  linesByProject,
  invoices,
  payments,
  onBack,
}: {
  customerId: string;
  customer: ReportCustomer | undefined;
  fallbackName: string;
  allRows: QuoteRow[];
  linesByProject: Map<string, ProjectLine[]>;
  invoices: Inv[];
  payments: Pay[];
  onBack: () => void;
}) {
  const { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range } = useDateRange("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");
  const today = toDateOnly(new Date());
  const name = customer?.name || fallbackName;

  const mine = useMemo(() => allRows.filter((r) => r.p.customer_id === customerId), [allRows, customerId]);
  const inPeriod = (r: QuoteRow) => inRange((r.p.entry_date || "").slice(0, 10), range.start, range.end);

  // Totals for the chosen period (revised quotes counted once, as their latest version).
  const stats = useMemo(() => {
    const live = mine.filter((r) => !isRevised(r.p.outcome) && inPeriod(r));
    const won = live.filter((r) => isWon(r.p.outcome));
    const lost = live.filter((r) => r.p.outcome === "Lost");
    const open = live.filter((r) => r.p.outcome === "Open");
    const sum = (xs: QuoteRow[]) => xs.reduce((s, r) => s + r.value, 0);
    const decideDays = won
      .filter((r) => r.p.accepted_at)
      .map((r) => daysBetween(r.sent || r.p.entry_date, r.p.accepted_at!))
      .filter((d) => d >= 0);
    const wonM2 = won.filter((r) => r.m2 > 0);
    // Business-wide win rate for the same period, to compare against.
    const biz = allRows.filter((r) => !isRevised(r.p.outcome) && inPeriod(r));
    return {
      quotes: live.length,
      quoted: sum(live),
      won: won.length,
      wonValue: sum(won),
      lost: lost.length,
      open: open.length,
      openValue: sum(open),
      rate: winRate(won.length, lost.length),
      bizRate: winRate(biz.filter((r) => isWon(r.p.outcome)).length, biz.filter((r) => r.p.outcome === "Lost").length),
      avgDays: decideDays.length ? Math.round(decideDays.reduce((s, d) => s + d, 0) / decideDays.length) : null,
      avgM2: wonM2.length ? Math.round(wonM2.reduce((s, r) => s + r.m2, 0) / wonM2.length) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, allRows, range.start, range.end]);

  // Money: issued invoices (not Draft/Void, credit notes are negative) less payments. All time.
  const money = useMemo(() => {
    const mineInv = invoices.filter((i) => i.customer_id === customerId && i.status !== "Draft" && i.status !== "Void");
    const ids = new Set(mineInv.map((i) => i.id));
    const invoiced = mineInv.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const paid = payments.filter((p) => ids.has(p.invoice_id)).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { invoiced, owing: invoiced - paid, count: mineInv.length };
  }, [invoices, payments, customerId]);

  // Win rate for each of the last 12 months (by quote entry date; ignores the period filter).
  const trend = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; won: number; lost: number; open: number; rate: number | null }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: toDateOnly(d).slice(0, 7), label: d.toLocaleDateString("en-AU", { month: "short" }), won: 0, lost: 0, open: 0, rate: null });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    let bw = 0, bl = 0;
    for (const r of allRows) {
      if (isRevised(r.p.outcome)) continue;
      const i = idx.get((r.p.entry_date || "").slice(0, 7));
      if (i === undefined) continue;
      if (isWon(r.p.outcome)) bw++;
      else if (r.p.outcome === "Lost") bl++;
      if (r.p.customer_id !== customerId) continue;
      if (isWon(r.p.outcome)) months[i].won++;
      else if (r.p.outcome === "Lost") months[i].lost++;
      else if (r.p.outcome === "Open") months[i].open++;
    }
    for (const m of months) m.rate = winRate(m.won, m.lost);
    return { months, bizRate: winRate(bw, bl) };
  }, [allRows, customerId]);

  // Open quotes, oldest first.
  const chase = useMemo(
    () =>
      mine
        .filter((r) => r.p.outcome === "Open")
        .map((r) => ({ r, age: r.sent ? daysBetween(r.sent, today) : 0 }))
        .sort((a, b) => b.age - a.age),
    [mine, today]
  );

  // Products on this customer's quotes in the period.
  const products = useMemo(() => {
    const m = new Map<string, { name: string; quotes: Set<string>; m2: number }>();
    for (const r of mine) {
      if (isRevised(r.p.outcome) || !inPeriod(r)) continue;
      for (const l of linesByProject.get(r.p.id) || []) {
        const n = l.parts?.name;
        if (!n) continue;
        if (!m.has(n)) m.set(n, { name: n, quotes: new Set(), m2: 0 });
        const e = m.get(n)!;
        e.quotes.add(r.p.id);
        if (Number(l.parts?.coverage_m2) > 0) e.m2 += Number(l.qty_m2) || 0;
      }
    }
    return Array.from(m.values()).sort((a, b) => b.quotes.size - a.quotes.size || b.m2 - a.m2).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, linesByProject, range.start, range.end]);

  // Plain-English points worth knowing, from the numbers above.
  const insights = useMemo(() => {
    const out: string[] = [];
    const m = trend.months;
    const half = (xs: typeof m) => ({ w: xs.reduce((s, x) => s + x.won, 0), l: xs.reduce((s, x) => s + x.lost, 0) });
    const a = half(m.slice(0, 6)), b = half(m.slice(6));
    const ra = winRate(a.w, a.l), rb = winRate(b.w, b.l);
    if (ra !== null && rb !== null && a.w + a.l >= 3 && b.w + b.l >= 3 && Math.abs(ra - rb) >= 10) {
      out.push(`Win rate ${rb > ra ? "rose" : "fell"} from ${ra}% to ${rb}% over the last 6 months (compared with the 6 before).`);
    }
    if (stats.rate !== null && stats.bizRate !== null && stats.won + stats.lost >= 3) {
      const diff = stats.rate - stats.bizRate;
      if (Math.abs(diff) >= 5) out.push(`Wins ${stats.rate}% of decided quotes — ${Math.abs(diff)} points ${diff > 0 ? "above" : "below"} the business average.`);
    }
    const stale = chase.filter((c) => c.age > 21);
    if (stale.length) out.push(`${stale.length} open quote${stale.length > 1 ? "s" : ""} older than 21 days, worth ${fmtCurrency(stale.reduce((s, c) => s + c.r.value, 0))}.`);
    const last = mine.filter((r) => !isRevised(r.p.outcome)).map((r) => (r.p.entry_date || "").slice(0, 10)).sort().pop();
    if (last) {
      const d = daysBetween(last, today);
      if (d > 60) out.push(`No new quote for ${d} days (last ${fmtDate(last)}).`);
    }
    if (customer?.last_contact_at) out.push(`Last CRM contact ${fmtDate(customer.last_contact_at)}.`);
    if (money.owing > 1) out.push(`${fmtCurrency(money.owing)} owing on invoices.`);
    return out;
  }, [trend, stats, chase, mine, today, customer, money]);

  // Quote history (every version, newest first), filtered by the search box and status pills.
  const history = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mine
      .filter(inPeriod)
      .filter((r) => {
        const o = r.p.outcome;
        if (status === "Open" && o !== "Open") return false;
        if (status === "Won" && !isWon(o)) return false;
        if (status === "Lost" && o !== "Lost") return false;
        if (status === "Revised" && !isRevised(o)) return false;
        if (!q) return true;
        return [quoteLabel(r.p), r.p.address, r.p.suburb].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => (b.p.entry_date || "").localeCompare(a.p.entry_date || "") || b.p.quote_number - a.p.quote_number || (b.p.revision_letter || "").localeCompare(a.p.revision_letter || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, search, status, range.start, range.end]);

  const outcomeNote = (r: QuoteRow) => {
    const p = r.p;
    if (isWon(p.outcome)) return p.accepted_at ? `Accepted ${fmtDate(p.accepted_at)}` : "Accepted";
    if (isRevised(p.outcome)) {
      const newer = mine.filter((x) => x.p.quote_number === p.quote_number && (x.p.revision_letter || "") > (p.revision_letter || "")).map((x) => quoteLabel(x.p)).sort().pop();
      return newer ? `Replaced by ${newer}` : "Replaced by a revision";
    }
    if (p.outcome === "Open") return r.sent ? `Open ${daysBetween(r.sent, today)} days` : "Open";
    return "";
  };

  const pill = (s: StatusFilter) => (
    <button
      key={s}
      onClick={() => setStatus(s)}
      className={`rounded-full px-3 py-1 text-xs font-medium ${status === s ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"}`}
    >
      {s}
    </button>
  );

  const maxBar = 120;
  const avgLine = trend.bizRate;

  return (
    <div className="mt-2">
      <button onClick={onBack} className="text-sm text-accent hover:underline">
        ← All customers
      </button>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{name}</h2>
            {customer?.category && <span className={`rounded-full px-2 py-0.5 text-xs ${CATEGORY_COLORS[customer.category] || "bg-gray-200 text-gray-700"}`}>{customer.category}</span>}
            {customer?.price_tier && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">Price level: {tierLabel(customer.price_tier)}</span>}
            {customer?.payment_terms && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">{customer.payment_terms}</span>}
          </div>
          <div className="mt-1 text-sm text-[var(--muted)]">
            {[customer?.contact_name, customer?.contact_phone, customer?.contact_email].filter(Boolean).join(" · ") || "No main contact on file"}
            {customer?.created_at && <> · Customer since {fmtDate(customer.created_at)}</>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link href={`/dashboard/crm/accounts/${customerId}`} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
            CRM account · log call / follow-up
          </Link>
          <button onClick={() => window.print()} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">
            Print
          </button>
        </div>
      </div>

      <div className="mt-4">
        <DateFilter preset={preset} setPreset={setPreset} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      </div>

      {/* Totals */}
      <div className="mt-4 flex flex-wrap gap-4">
        <Tile label="Quoted" value={fmtK(stats.quoted)} sub={`${stats.quotes} quote${stats.quotes === 1 ? "" : "s"}`} />
        <Tile label="Won" value={fmtK(stats.wonValue)} sub={`${stats.won} accepted`} tone="good" />
        <Tile
          label="Win rate"
          value={stats.rate === null ? "—" : `${stats.rate}%`}
          sub={stats.bizRate === null ? "Accepted ÷ (accepted + lost)" : `Business average ${stats.bizRate}%`}
          tone={stats.rate !== null && stats.bizRate !== null && stats.rate < stats.bizRate ? "warn" : undefined}
        />
        <Tile label="Open" value={fmtK(stats.openValue)} sub={`${stats.open} quote${stats.open === 1 ? "" : "s"}`} tone="blue" />
        <Tile label="Avg job size" value={stats.avgM2 === null ? "—" : `${stats.avgM2} m²`} sub="Accepted jobs, stock products" />
        <Tile label="Avg days to accept" value={stats.avgDays === null ? "—" : String(stats.avgDays)} sub="From emailed to accepted" />
        <Tile label="Owing" value={fmtCurrency(money.owing)} sub={`${fmtK(money.invoiced)} invoiced (all time)`} tone={money.owing > 1 ? "warn" : undefined} />
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[999_1_640px] space-y-4">
          {/* Trend */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Win rate – last 12 months</div>
              <div className="text-xs text-[var(--muted)]">
                By quote entry date · dashed line = business average{avgLine !== null ? ` ${avgLine}%` : ""} · amber = below average
              </div>
            </div>
            <div className="relative mt-3 flex items-end gap-2 border-b border-[var(--border)]" style={{ height: maxBar + 22 }}>
              {avgLine !== null && <div className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-gray-400" style={{ bottom: (avgLine / 100) * maxBar }} />}
              {trend.months.map((m) => (
                <div
                  key={m.key}
                  className="flex flex-1 flex-col items-center justify-end gap-1"
                  style={{ height: maxBar + 22 }}
                  title={`${m.label}: ${m.won} won, ${m.lost} lost, ${m.open} open`}
                >
                  <div className="text-[11px] text-[var(--muted)]">{m.rate === null ? (m.open ? `${m.open} open` : "—") : `${m.rate}%`}</div>
                  <div
                    className="w-full max-w-[34px] rounded-t"
                    style={{
                      height: m.rate === null ? 0 : Math.max(3, (m.rate / 100) * maxBar),
                      background: m.rate !== null && avgLine !== null && m.rate < avgLine ? "#f59e0b" : "var(--accent)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-2 text-[11px] text-[var(--muted)]">
              {trend.months.map((m) => (
                <div key={m.key} className="flex-1 text-center">
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Quote history */}
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="font-semibold">Quote history</div>
              <div className="flex flex-wrap items-center gap-2">
                {(["All", "Open", "Won", "Lost", "Revised"] as StatusFilter[]).map(pill)}
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search site address or Q#…"
                  className="w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Quote</th>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Entered</th>
                    <th className="px-3 py-2">Emailed</th>
                    <th className="px-3 py-2 text-right">m²</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.p.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        <Link href={`/dashboard/quotes/${r.p.id}`} className="text-accent hover:underline">
                          {quoteLabel(r.p)}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{[r.p.address, r.p.suburb].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.p.entry_date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.p.emailed_at)}</td>
                      <td className="px-3 py-2 text-right">{r.m2 ? Math.round(r.m2) : "—"}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(r.value)}</td>
                      <td className="px-3 py-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${OUTCOME_COLORS[r.p.outcome] || ""}`}>{outcomeLabel(r.p.outcome)}</span>
                      </td>
                      <td className="px-3 py-2 text-[var(--muted)]">{outcomeNote(r)}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
                        No quotes match.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-[1_1_320px] space-y-4">
          {insights.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-[#1e293b]">
              <div className="font-semibold text-blue-900">What stands out</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {insights.map((t) => (
                  <li key={t}>• {t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="font-semibold">Open quotes to chase</div>
            {chase.length === 0 && <div className="mt-2 text-sm text-[var(--muted)]">No open quotes.</div>}
            <div className="mt-2 divide-y divide-[var(--border)]">
              {chase.map(({ r, age }) => (
                <div key={r.p.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <Link href={`/dashboard/quotes/${r.p.id}`} className="text-sm font-medium text-accent hover:underline">
                      {quoteLabel(r.p)}
                    </Link>
                    <span className="text-sm"> · {fmtCurrency(r.value)}</span>
                    <div className={`text-xs ${age > 60 ? "text-[var(--bb-bad)]" : age > 21 ? "text-[var(--bb-warn)]" : "text-[var(--muted)]"}`}>
                      {r.p.emailed_at ? "Emailed" : "Entered"} {age} day{age === 1 ? "" : "s"} ago{r.p.suburb ? ` · ${r.p.suburb}` : ""}
                    </div>
                  </div>
                  <Link href={`/dashboard/crm/accounts/${customerId}`} className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs print:hidden">
                    Follow up
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="font-semibold">Products quoted most</div>
            {products.length === 0 && <div className="mt-2 text-sm text-[var(--muted)]">No quote lines in this period.</div>}
            <div className="mt-2 space-y-1.5">
              {products.map((p) => (
                <div key={p.name} className="flex justify-between gap-3 text-sm">
                  <span>{p.name}</span>
                  <span className="whitespace-nowrap text-[var(--muted)]">
                    {p.quotes.size} quote{p.quotes.size === 1 ? "" : "s"}
                    {p.m2 > 0 ? ` · ${Math.round(p.m2).toLocaleString("en-AU")} m²` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
