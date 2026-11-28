// Sales Report (directors' weekly report) maths. Pure functions over the rows the page loads,
// so the figures can be checked without a browser or a database.
//
// Definitions (all money is ex GST):
// - Sales = issued invoices (not Draft or Void), by invoice date. Credit notes are negative, so they reduce sales.
// - Weeks run Monday to Sunday and are numbered like a calendar week number (ISO week, week 1 holds the first Thursday of January).
//   Only days inside the calendar year are counted, so the weeks always add up to the year's total.
// - Cash sales = stock items sold on invoices, to anyone, leaving out deliveries to jobs that have a work order
//   (the same rule as Reports > Daily / weekly / monthly).
// - Private jobs complete = work orders marked complete in the week whose customer is not a Builder.
// - Quotes = new quotes created in the week (revisions like Q1125-A are not counted again), with their value ex GST.

export type SInvoice = {
  id: string;
  project_id: string | null;
  kind?: string | null;
  amount_ex_gst: number | null;
  status: string;
  invoice_date: string | null;
  customers: { name: string | null; category?: string | null } | null;
};
export type SInvoiceLine = {
  invoice_id: string;
  part_id: string | null;
  line_ex: number | null;
  invoices: { status: string; invoice_date: string | null; project_id: string | null } | null;
};
export type SWorkOrder = {
  id: string;
  project_id: string | null;
  archived: boolean | null;
  completed_date: string | null;
  projects: { customers: { category?: string | null } | null } | null;
};
export type SQuote = { id: string; entry_date: string | null; archived: boolean | null; revision_letter?: string | null; value: number };

export type SalesData = { invoices: SInvoice[]; invoiceLines: SInvoiceLine[]; workOrders: SWorkOrder[]; quotes: SQuote[] };

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const num = (v: unknown) => Number(v) || 0;

/** Monday of ISO week 1 of a year (the week holding 4 January). */
export function isoWeek1Monday(year: number) {
  const jan4 = new Date(year, 0, 4);
  return addDays(jan4, -((jan4.getDay() + 6) % 7));
}
/** ISO year and week number of a date. */
export function isoWeekOf(d: Date): { year: number; week: number } {
  const thursday = addDays(d, 3 - ((d.getDay() + 6) % 7));
  const year = thursday.getFullYear();
  const week = Math.round((thursday.getTime() - isoWeek1Monday(year).getTime()) / (7 * 86400000)) + 1;
  return { year, week };
}
export function weeksInYear(year: number) {
  return isoWeekOf(new Date(year, 11, 28)).week;
}
/** Monday to Sunday of a week, clipped to the calendar year so no day is counted in two years. */
export function weekRange(year: number, week: number) {
  const mon = addDays(isoWeek1Monday(year), (week - 1) * 7);
  const sun = addDays(mon, 6);
  const start = ymd(mon) < `${year}-01-01` ? `${year}-01-01` : ymd(mon);
  const end = ymd(sun) > `${year}-12-31` ? `${year}-12-31` : ymd(sun);
  return { mon, sun, start, end };
}
/** The last finished week (the report goes out after the week ends). */
export function lastFinishedWeek(now: Date) {
  return isoWeekOf(addDays(now, -7));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const issued = (status: string) => status !== "Draft" && status !== "Void";

export type SalesReport = ReturnType<typeof computeSalesReport>;

export function computeSalesReport(data: SalesData, year: number, week: number, target: number) {
  const nWeeks = weeksInYear(year);
  const sel = weekRange(year, week);
  const prev = week > 1 ? weekRange(year, week - 1) : null;
  const inR = (d: string | null | undefined, s: string, e: string) => !!d && d >= s && d <= e;
  const yearStart = `${year}-01-01`;

  const invs = data.invoices.filter((i) => issued(i.status) && i.invoice_date && i.invoice_date.slice(0, 4) === String(year));

  // ---- weekly and monthly sales ----
  const weekOf = (date: string) => isoWeekOf(new Date(date + "T00:00:00"));
  const weekNo = (date: string) => {
    const w = weekOf(date);
    // 29-31 Dec can fall in week 1 of next year, and 1-3 Jan in the last week of last year: keep them in this year's first/last week.
    if (w.year > year) return nWeeks;
    if (w.year < year) return 1;
    return w.week;
  };
  const weekly = Array.from({ length: nWeeks }, (_, i) => ({ week: i + 1, sales: 0, count: 0, cashCount: 0, cashSales: 0 }));
  const monthly = MONTHS.map((label) => ({ label, sales: 0 }));
  for (const i of invs) {
    const w = weekly[weekNo(i.invoice_date!) - 1];
    w.sales += num(i.amount_ex_gst);
    if (i.kind !== "Credit") w.count += 1;
    if (i.invoice_date! <= sel.end) monthly[Number(i.invoice_date!.slice(5, 7)) - 1].sales += num(i.amount_ex_gst);
  }

  // ---- cash sales: stock lines on invoices, less deliveries to jobs with a work order ----
  const woProjects = new Set(data.workOrders.filter((w) => !w.archived && w.project_id).map((w) => w.project_id!));
  const cashByInv = new Map<string, { date: string; ex: number }>();
  for (const l of data.invoiceLines) {
    const inv = l.invoices;
    if (!inv || !issued(inv.status) || !l.part_id || !inv.invoice_date || inv.invoice_date.slice(0, 4) !== String(year)) continue;
    if (inv.project_id && woProjects.has(inv.project_id)) continue;
    const r = cashByInv.get(l.invoice_id) ?? { date: inv.invoice_date, ex: 0 };
    r.ex += num(l.line_ex);
    cashByInv.set(l.invoice_id, r);
  }
  for (const r of cashByInv.values()) {
    const w = weekly[weekNo(r.date) - 1];
    w.cashSales += r.ex;
    if (r.ex > 0) w.cashCount += 1; // a refund (credit note) is not a sale
  }

  // ---- year to date ----
  const shown = weekly.slice(0, week);
  const ytd = shown.reduce((s, w) => s + w.sales, 0);
  const weeksWithSales = shown.filter((w) => w.sales !== 0).length;
  const weeklyAverage = weeksWithSales ? ytd / weeksWithSales : 0;
  const vsTarget = target > 0 ? (ytd / target - 1) * 100 : null;

  const thisWeek = weekly[week - 1];
  const lastWeek = week > 1 ? weekly[week - 2] : null;

  // ---- private jobs completed ----
  const privateJobs = (s: string, e: string) =>
    data.workOrders.filter((w) => !w.archived && inR(w.completed_date, s, e) && (w.projects?.customers?.category ?? "Private") !== "Builder").length;

  // ---- quotes ----
  const quotesIn = (s: string, e: string) => {
    const q = data.quotes.filter((p) => !p.archived && !p.revision_letter && inR(p.entry_date, s, e));
    return { count: q.length, value: q.reduce((t, p) => t + num(p.value), 0) };
  };

  // ---- top 10 customers, year to the selected week ----
  const byCust = new Map<string, number>();
  for (const i of invs) {
    if (i.invoice_date! > sel.end) continue;
    const name = i.customers?.name?.trim() || "No customer";
    byCust.set(name, (byCust.get(name) ?? 0) + num(i.amount_ex_gst));
  }
  const topCustomers = [...byCust.entries()]
    .map(([name, sales]) => ({ name, sales }))
    .filter((c) => c.sales > 0)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10);

  return {
    year,
    week,
    nWeeks,
    range: sel,
    target,
    ytd,
    ytdFrom: yearStart,
    weeklyAverage,
    weeksWithSales,
    vsTarget,
    week_: {
      sales: thisWeek.sales,
      count: thisWeek.count,
      cashSales: thisWeek.cashSales,
      cashCount: thisWeek.cashCount,
      privateJobs: privateJobs(sel.start, sel.end),
      quotes: quotesIn(sel.start, sel.end),
    },
    prevWeek: prev && lastWeek
      ? { sales: lastWeek.sales, cashSales: lastWeek.cashSales, privateJobs: privateJobs(prev.start, prev.end), quotes: quotesIn(prev.start, prev.end) }
      : null,
    weekly: shown,
    monthly,
    lastMonth: Number(sel.end.slice(5, 7)),
    topCustomers,
  };
}
