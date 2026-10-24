// Customer statement maths: open invoices as at a date, aged by how far past their due date they are.
import { round2 } from "@/lib/invoices";

export type StatementInvoice = {
  id: string;
  invoice_number: number;
  customer_id: string | null;
  description: string | null;
  customer_po: string | null;
  total: number;
  status: string;
  invoice_date: string;
  due_date: string | null;
};

export type StatementPayment = { invoice_id: string; paid_on: string; amount: number; method?: string | null; reference?: string | null };

export type Bucket = "current" | "d1_30" | "d31_60" | "d61";

export const BUCKET_LABELS: Record<Bucket, string> = {
  current: "Current",
  d1_30: "1–30 days",
  d31_60: "31–60 days",
  d61: "61+ days",
};

export type StatementRow = {
  invoice: StatementInvoice;
  paid: number;
  balance: number;
  due: string;
  daysOverdue: number;
  bucket: Bucket;
};

export type Ageing = Record<Bucket, number> & { total: number };

const DAY = 86400000;
const dayNum = (iso: string) => Math.floor(new Date(iso + "T00:00:00Z").getTime() / DAY);

export function bucketFor(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  return "d61";
}

export function emptyAgeing(): Ageing {
  return { current: 0, d1_30: 0, d31_60: 0, d61: 0, total: 0 };
}

/**
 * Open (unpaid) invoices as at asOf. Drafts and voids are left out, as is anything dated after asOf;
 * only payments received on or before asOf count.
 */
export function statementRows(invoices: StatementInvoice[], payments: StatementPayment[], asOf: string): StatementRow[] {
  const paidBy = new Map<string, number>();
  for (const p of payments) {
    if (p.paid_on <= asOf) paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
  }
  const rows: StatementRow[] = [];
  for (const inv of invoices) {
    if (inv.status === "Void" || inv.status === "Draft" || inv.invoice_date > asOf) continue;
    const paid = round2(paidBy.get(inv.id) ?? 0);
    const balance = round2(Number(inv.total || 0) - paid);
    if (balance <= 0.005) continue;
    const due = inv.due_date || inv.invoice_date;
    const daysOverdue = dayNum(asOf) - dayNum(due);
    rows.push({ invoice: inv, paid, balance, due, daysOverdue, bucket: bucketFor(daysOverdue) });
  }
  return rows.sort((a, b) => a.invoice.invoice_date.localeCompare(b.invoice.invoice_date) || a.invoice.invoice_number - b.invoice.invoice_number);
}

export function ageingOf(rows: StatementRow[]): Ageing {
  const a = emptyAgeing();
  for (const r of rows) {
    a[r.bucket] = round2(a[r.bucket] + r.balance);
    a.total = round2(a.total + r.balance);
  }
  return a;
}

/** Payments received in the 60 days up to asOf, newest first (shown on the statement for reference). */
export function recentPayments(invoices: StatementInvoice[], payments: StatementPayment[], asOf: string) {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const from = new Date(dayNum(asOf) * DAY - 60 * DAY).toISOString().slice(0, 10);
  return payments
    .filter((p) => p.paid_on <= asOf && p.paid_on >= from && byId.has(p.invoice_id))
    .map((p) => ({ ...p, invoice_number: byId.get(p.invoice_id)!.invoice_number }))
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on));
}
