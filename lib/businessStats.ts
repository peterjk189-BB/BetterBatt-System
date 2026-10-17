// Business dashboard maths. Pure functions over the rows the page loads, so
// the numbers can be tested without a browser or a database.
import { quoteTotals } from "@/lib/quoteTotals";
import { jobProgress } from "@/lib/jobProgress";

type Part = {
  coverage_m2: number;
  pack_cost_ex_gst: number;
  installer_rate_per_m2: number;
  supply_charge_per_pack: number;
  price_retail?: number | null;
  price_trade?: number | null;
  price_regency?: number | null;
  supply_install_rate_per_m2: number;
} | null;

export type BProject = {
  id: string;
  quote_number: number;
  job_type: string;
  outcome: string;
  entry_date: string;
  quote_markup: number;
  price_tier?: string | null;
  archived: boolean;
  customers: { name: string; discount_pct: number } | null;
};
export type BProjectLine = { project_id: string; qty_m2: number; parts: Part };
export type BWorkOrder = { id: string; project_id: string | null; archived: boolean; completed_date: string | null };
export type BWoLine = {
  work_order_id: string;
  qty: number | null;
  labour_item_id: string | null;
  part_id: string | null;
  task_date: string | null;
  completed: boolean | null;
  paid: boolean | null;
  picked: boolean | null;
  picked_at: string | null;
  multi_picked: number | null;
  packs_picked: number | null;
  multi_returned: number | null;
  packs_returned: number | null;
  parts: { coverage_m2: number; pack_cost_ex_gst: number; pack_per_multi: number } | null;
};
export type BInvoice = {
  id: string;
  project_id: string | null;
  invoice_number: number;
  kind: string;
  amount_ex_gst: number;
  total: number;
  status: string; // Draft | Sent | Void
  invoice_date: string;
  due_date: string | null;
  customers: { name: string } | null;
};
export type BPayment = { invoice_id: string; paid_on: string; amount: number };
export type BSwms = { id: string; status: string; archived?: boolean; swms_number?: number; work_order_id: string };
export type BInspection = {
  id: string;
  inspection_number: number;
  status: string;
  result: string | null;
  parent_inspection_id: string | null;
  archived?: boolean;
  work_order_id: string;
};
export type BPo = { id: string; status: string; archived: boolean };
export type BPoLine = { purchase_order_id: string; qty_pks: number | null; unit_cost: number | null };
export type BStockPart = { stock_on_hand: number | null; pack_cost_ex_gst: number | null; supplier_id: string | null; archived: boolean };
export type BSupplier = { id: string; name: string };
export type BSub = { name: string; insurance_expiry: string | null; archived: boolean };
export type BLabour = { id: string; contractor_rate: number };

export type BData = {
  projects: BProject[];
  projectLines: BProjectLine[];
  workOrders: BWorkOrder[];
  woLines: BWoLine[];
  labourItems: BLabour[];
  invoices: BInvoice[];
  payments: BPayment[];
  swms: BSwms[];
  inspections: BInspection[];
  pos: BPo[];
  poLines: BPoLine[];
  stockParts: BStockPart[];
  suppliers: BSupplier[];
  subs: BSub[];
};

export type Period = "month" | "quarter" | "year";

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Australian financial year: 1 July to 30 June. Quarters follow it (Jul-Sep, Oct-Dec, Jan-Mar, Apr-Jun). */
export function periodRange(period: Period, now: Date): { start: string; end: string; label: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "month") {
    return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)), label: now.toLocaleDateString("en-AU", { month: "long", year: "numeric" }) };
  }
  const fyStartYear = m >= 6 ? y : y - 1;
  if (period === "year") {
    return { start: `${fyStartYear}-07-01`, end: `${fyStartYear + 1}-06-30`, label: `FY ${fyStartYear}/${String(fyStartYear + 1).slice(2)}` };
  }
  const fm = (m + 6) % 12; // months since 1 July
  const q = Math.floor(fm / 3);
  const qs = new Date(fyStartYear, 6 + q * 3, 1);
  const qe = new Date(fyStartYear, 6 + q * 3 + 3, 0);
  return { start: ymd(qs), end: ymd(qe), label: `FY quarter ${q + 1} (${qs.toLocaleDateString("en-AU", { month: "short" })} to ${qe.toLocaleDateString("en-AU", { month: "short", year: "numeric" })})` };
}

const inR = (d: string | null | undefined, s: string, e: string) => !!d && d >= s && d <= e;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);

type JobCost = { materials: number; contractors: number };

/** Cost of one job: real figures from work orders and picking slips when they exist, otherwise the quote's own estimate. */
export function jobCost(project: BProject, projectLines: BProjectLine[], woLines: BWoLine[], rate: Map<string, number>): JobCost {
  let materials = 0;
  let contractors = 0;
  if (woLines.length) {
    for (const l of woLines) {
      contractors += (Number(l.qty) || 0) * (l.labour_item_id ? rate.get(l.labour_item_id) ?? 0 : 0);
      if (!l.parts) continue;
      const cost = Number(l.parts.pack_cost_ex_gst) || 0;
      if (l.picked) {
        const ppm = Number(l.parts.pack_per_multi) || 0;
        const picked = (Number(l.multi_picked) || 0) * ppm + (Number(l.packs_picked) || 0);
        const back = (Number(l.multi_returned) || 0) * ppm + (Number(l.packs_returned) || 0);
        materials += (picked - back) * cost;
      } else if (l.parts.coverage_m2 > 0 && l.part_id) {
        materials += Math.ceil((Number(l.qty) || 0) / l.parts.coverage_m2 - 1e-9) * cost;
      }
    }
  } else {
    const supplyOnly = project.job_type === "SUPPLY ONLY";
    for (const l of projectLines) {
      if (!l.parts) continue;
      const q = Number(l.qty_m2) || 0;
      const packs = l.parts.coverage_m2 > 0 ? Math.ceil(q / l.parts.coverage_m2) : 0;
      materials += packs * l.parts.pack_cost_ex_gst;
      if (!supplyOnly) contractors += q * l.parts.installer_rate_per_m2;
    }
  }
  return { materials, contractors };
}

export type Stats = ReturnType<typeof computeStats>;

export function computeStats(data: BData, period: Period, now: Date) {
  const today = ymd(now);
  const { start, end, label } = periodRange(period, now);
  const rate = new Map(data.labourItems.map((l) => [l.id, Number(l.contractor_rate) || 0]));

  // ---- invoices & payments -------------------------------------------------
  const issued = data.invoices.filter((i) => i.status === "Sent"); // Draft and Void are not sales
  const paidBy = new Map<string, number>();
  data.payments.forEach((p) => paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + (Number(p.amount) || 0)));
  const lastPaid = new Map<string, string>();
  data.payments.forEach((p) => {
    const c = lastPaid.get(p.invoice_id);
    if (!c || p.paid_on > c) lastPaid.set(p.invoice_id, p.paid_on);
  });

  const sales = issued.filter((i) => inR(i.invoice_date, start, end)).reduce((s, i) => s + (Number(i.amount_ex_gst) || 0), 0);
  const cashIn = data.payments.filter((p) => inR(p.paid_on, start, end)).reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // ---- costs in the period: materials when picked, contractors by task date ---
  const costInPeriod = (s: string, e: string) => {
    let c = 0;
    for (const l of data.woLines) {
      if (l.task_date && inR(l.task_date, s, e)) c += (Number(l.qty) || 0) * (l.labour_item_id ? rate.get(l.labour_item_id) ?? 0 : 0);
      if (l.picked && l.picked_at && l.parts && inR(l.picked_at.slice(0, 10), s, e)) {
        const ppm = Number(l.parts.pack_per_multi) || 0;
        const picked = (Number(l.multi_picked) || 0) * ppm + (Number(l.packs_picked) || 0);
        const back = (Number(l.multi_returned) || 0) * ppm + (Number(l.packs_returned) || 0);
        c += (picked - back) * (Number(l.parts.pack_cost_ex_gst) || 0);
      }
    }
    return c;
  };
  const costs = costInPeriod(start, end);
  const profit = sales - costs;
  const margin = sales > 0 ? (profit / sales) * 100 : null;

  // ---- monthly trend: the last 12 months to this month -------------------------
  const trend: { label: string; sales: number; costs: number }[] = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const s = ymd(d);
    const e = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    trend.push({
      label: d.toLocaleDateString("en-AU", { month: "short" }),
      sales: issued.filter((i) => inR(i.invoice_date, s, e)).reduce((a, i) => a + (Number(i.amount_ex_gst) || 0), 0),
      costs: costInPeriod(s, e),
    });
  }

  // ---- receivables ---------------------------------------------------------------
  const owingRows = issued
    .map((i) => ({ i, owing: r2((Number(i.total) || 0) - (paidBy.get(i.id) ?? 0)) }))
    .filter((r) => r.owing > 0.005);
  const buckets = { notDue: 0, d1_30: 0, d31_60: 0, d60: 0 };
  let overdueTotal = 0;
  let overdueCount = 0;
  for (const r of owingRows) {
    const due = r.i.due_date;
    const late = due && due < today ? daysBetween(due, today) : 0;
    if (late <= 0) buckets.notDue += r.owing;
    else {
      overdueTotal += r.owing;
      overdueCount += 1;
      if (late <= 30) buckets.d1_30 += r.owing;
      else if (late <= 60) buckets.d31_60 += r.owing;
      else buckets.d60 += r.owing;
    }
  }
  const owedTotal = owingRows.reduce((s, r) => s + r.owing, 0);
  const topOwing = owingRows
    .map((r) => ({
      customer: r.i.customers?.name ?? "No customer",
      number: r.i.invoice_number,
      id: r.i.id,
      owing: r.owing,
      daysLate: r.i.due_date && r.i.due_date < today ? daysBetween(r.i.due_date, today) : 0,
      part: (paidBy.get(r.i.id) ?? 0) > 0,
    }))
    .sort((a, b) => b.daysLate - a.daysLate || b.owing - a.owing)
    .slice(0, 6);

  // ---- jobs (accepted quotes) in the period --------------------------------------
  const linesBy = new Map<string, BProjectLine[]>();
  data.projectLines.forEach((l) => linesBy.set(l.project_id, [...(linesBy.get(l.project_id) ?? []), l]));
  const wosBy = new Map<string, string[]>();
  data.workOrders.filter((w) => !w.archived && w.project_id).forEach((w) => wosBy.set(w.project_id!, [...(wosBy.get(w.project_id!) ?? []), w.id]));
  const woLinesBy = new Map<string, BWoLine[]>();
  data.woLines.forEach((l) => woLinesBy.set(l.work_order_id, [...(woLinesBy.get(l.work_order_id) ?? []), l]));
  const invBy = new Map<string, BInvoice[]>();
  issued.forEach((i) => i.project_id && invBy.set(i.project_id, [...(invBy.get(i.project_id) ?? []), i]));

  const jobs = data.projects
    .filter((p) => !p.archived && p.outcome === "Accepted" && inR(p.entry_date, start, end))
    .map((p) => {
      const pl = linesBy.get(p.id) ?? [];
      const wl = (wosBy.get(p.id) ?? []).flatMap((id) => woLinesBy.get(id) ?? []);
      const c = jobCost(p, pl, wl, rate);
      const revenue = quoteTotals(p as any, pl as any).ex;
      return { p, revenue, cost: c.materials + c.contractors, profit: revenue - c.materials - c.contractors };
    });

  const byType = new Map<string, { type: string; revenue: number; profit: number; jobs: number }>();
  const byCust = new Map<string, { name: string; jobs: number; revenue: number; profit: number }>();
  for (const j of jobs) {
    const t = byType.get(j.p.job_type) ?? { type: j.p.job_type, revenue: 0, profit: 0, jobs: 0 };
    t.revenue += j.revenue; t.profit += j.profit; t.jobs += 1;
    byType.set(j.p.job_type, t);
    const name = j.p.customers?.name ?? "No customer";
    const c = byCust.get(name) ?? { name, jobs: 0, revenue: 0, profit: 0 };
    c.revenue += j.revenue; c.profit += j.profit; c.jobs += 1;
    byCust.set(name, c);
  }
  const marginByType = Array.from(byType.values())
    .filter((t) => t.revenue > 0)
    .map((t) => ({ ...t, margin: (t.profit / t.revenue) * 100 }))
    .sort((a, b) => b.margin - a.margin);
  const topCustomers = Array.from(byCust.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  // ---- quote to cash ---------------------------------------------------------------
  const inPeriodQuotes = data.projects.filter((p) => !p.archived && inR(p.entry_date, start, end));
  const accepted = inPeriodQuotes.filter((p) => p.outcome === "Accepted");
  const lost = inPeriodQuotes.filter((p) => p.outcome === "Lost").length;
  const invoicedJobs = accepted.filter((p) => (invBy.get(p.id) ?? []).length > 0);
  const paidJobs = invoicedJobs.filter((p) => (invBy.get(p.id) ?? []).every((i) => (paidBy.get(i.id) ?? 0) >= (Number(i.total) || 0) - 0.005));
  const winRate = accepted.length + lost > 0 ? (accepted.length / (accepted.length + lost)) * 100 : null;
  const payDays: number[] = [];
  issued.forEach((i) => {
    const lp = lastPaid.get(i.id);
    if (lp && (paidBy.get(i.id) ?? 0) >= (Number(i.total) || 0) - 0.005 && inR(i.invoice_date, start, end)) payDays.push(daysBetween(i.invoice_date, lp));
  });
  const avgPayDays = payDays.length ? Math.round(payDays.reduce((a, b) => a + b, 0) / payDays.length) : null;

  // ---- needs attention ------------------------------------------------------------
  const swmsBy = new Map<string, BSwms[]>();
  data.swms.forEach((s) => swmsBy.set(s.work_order_id, [...(swmsBy.get(s.work_order_id) ?? []), s]));
  const insBy = new Map<string, BInspection[]>();
  data.inspections.forEach((i) => insBy.set(i.work_order_id, [...(insBy.get(i.work_order_id) ?? []), i]));
  let waitingSwms = 0;
  let reinspect = 0;
  for (const w of data.workOrders) {
    if (w.archived || w.completed_date) continue;
    const p = jobProgress(swmsBy.get(w.id) ?? [], insBy.get(w.id) ?? []);
    if (p.stage === "awaiting-swms") waitingSwms += 1;
    if (p.stage === "reinspection-due") reinspect += 1;
  }
  const acceptedNoInvoice = data.projects.filter((p) => !p.archived && p.outcome === "Accepted" && !(invBy.get(p.id) ?? []).length).length;
  const draftPos = data.pos.filter((p) => !p.archived && p.status === "Draft").length;
  const in30 = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
  const insuranceSoon = data.subs.filter((s) => !s.archived && s.insurance_expiry && s.insurance_expiry <= in30).length;
  let contractorsOwed = 0;
  for (const l of data.woLines) {
    if (l.completed && !l.paid) contractorsOwed += (Number(l.qty) || 0) * (l.labour_item_id ? rate.get(l.labour_item_id) ?? 0 : 0);
  }

  // ---- stock and cash out ---------------------------------------------------------
  const supName = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const stockBy = new Map<string, number>();
  for (const p of data.stockParts) {
    if (p.archived) continue;
    const v = (Number(p.stock_on_hand) || 0) * (Number(p.pack_cost_ex_gst) || 0);
    if (v <= 0) continue;
    const n = (p.supplier_id && supName.get(p.supplier_id)) || "No supplier";
    stockBy.set(n, (stockBy.get(n) ?? 0) + v);
  }
  const stock = Array.from(stockBy, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const poValue = (status: string) => {
    const ids = new Set(data.pos.filter((p) => !p.archived && p.status === status).map((p) => p.id));
    return data.poLines.filter((l) => ids.has(l.purchase_order_id)).reduce((s, l) => s + (Number(l.qty_pks) || 0) * (Number(l.unit_cost) || 0), 0);
  };

  return {
    label, start, end,
    sales, costs, profit, margin, cashIn, owedTotal, overdueTotal, overdueCount,
    winRate, wonCount: accepted.length, decidedCount: accepted.length + lost,
    trend, buckets, topOwing, marginByType, topCustomers,
    funnel: { quotes: inPeriodQuotes.length, accepted: accepted.length, invoiced: invoicedJobs.length, paid: paidJobs.length },
    avgPayDays,
    attention: { waitingSwms, reinspect, overdue: overdueCount, acceptedNoInvoice, draftPos, insuranceSoon, contractorsOwed },
    stock, stockTotal: stock.reduce((s, x) => s + x.value, 0),
    cashOut: { contractorsOwed, poOrdered: poValue("Ordered"), poDraft: poValue("Draft") },
  };
}
