// Builder rating: payment behaviour worked out from invoices + payments, adjusted by logged notes.

export type Grade = "A" | "B" | "C" | "D";
export type RatingNote = { id: string; category: string; severity: "low" | "med" | "high" | "good"; note: string; created_at: string; created_by_name: string | null; project_id: string | null };
export type RatingInvoice = { id: string; invoice_number: number; status: string; total: number; invoice_date: string; due_date: string | null };
export type RatingPayment = { invoice_id: string; paid_on: string; amount: number };

export const GRADE_RULE: Record<Grade, string> = {
  A: "Normal terms.",
  B: "Normal terms. Keep an eye on payment times.",
  C: "Deposit recommended before work starts. Invoice on completion.",
  D: "Payment up front, or office approval before any work is booked.",
};

export const CATEGORIES = [
  "Late payment / chasing",
  "Disputed invoice",
  "Extras demanded beyond quote",
  "Changes after quote",
  "Site not ready / wasted trip",
  "Back-charge",
  "Good experience",
  "Other",
];

const DAY = 86400000;
const d = (s: string) => new Date(s.slice(0, 10) + "T00:00:00").getTime();
const ORDER: Grade[] = ["A", "B", "C", "D"];

export type InvoiceRow = { id: string; number: number; due: string; paidOn: string | null; daysLate: number | null; overdueDays: number | null; balance: number };

export function computeRating(invoices: RatingInvoice[], payments: RatingPayment[], notes: RatingNote[], override?: string | null, today = new Date()) {
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const payBy = new Map<string, RatingPayment[]>();
  for (const p of payments) {
    if (!payBy.has(p.invoice_id)) payBy.set(p.invoice_id, []);
    payBy.get(p.invoice_id)!.push(p);
  }
  const rows: InvoiceRow[] = [];
  for (const inv of invoices) {
    if (inv.status === "Draft" || inv.status === "Void") continue;
    const due = inv.due_date || new Date(d(inv.invoice_date) + 7 * DAY).toISOString().slice(0, 10);
    const pays = (payBy.get(inv.id) ?? []).sort((a, b) => (a.paid_on < b.paid_on ? -1 : 1));
    const total = Number(inv.total) || 0;
    let run = 0;
    let paidOn: string | null = null;
    for (const p of pays) {
      run += Number(p.amount) || 0;
      if (!paidOn && run >= total - 0.01) paidOn = p.paid_on;
    }
    const balance = Math.max(0, total - run);
    if (paidOn) rows.push({ id: inv.id, number: inv.invoice_number, due, paidOn, daysLate: Math.max(0, Math.round((d(paidOn) - d(due)) / DAY)), overdueDays: null, balance: 0 });
    else if (d(due) < now) rows.push({ id: inv.id, number: inv.invoice_number, due, paidOn: null, daysLate: null, overdueDays: Math.round((now - d(due)) / DAY), balance });
  }
  rows.sort((a, b) => (a.due < b.due ? 1 : -1));

  const n = rows.length;
  const late = rows.filter((r) => (r.daysLate ?? 0) > 0 || r.overdueDays !== null);
  const lateDays = late.map((r) => r.daysLate ?? r.overdueDays ?? 0);
  const avgLate = late.length ? lateDays.reduce((s, x) => s + x, 0) / late.length : 0;
  const lateRate = n ? late.length / n : 0;
  const overdue = rows.filter((r) => r.overdueDays !== null);
  const overdueBalance = overdue.reduce((s, r) => s + r.balance, 0);
  const maxOverdue = overdue.reduce((m, r) => Math.max(m, r.overdueDays ?? 0), 0);

  let idx = 0; // A
  if (n) {
    if (lateRate > 0.15 || avgLate > 3) idx = 1;
    if (lateRate > 0.4 || avgLate > 10) idx = 2;
    if (lateRate > 0.7 || avgLate > 25) idx = 3;
    if (maxOverdue >= 21) idx = Math.max(idx, 2);
    if (maxOverdue >= 45) idx = 3;
  }
  const recentHigh = notes.filter((x) => x.severity === "high" && now - d(x.created_at) <= 180 * DAY).length;
  idx = Math.min(3, idx + Math.min(2, recentHigh));
  const auto: Grade = ORDER[idx];
  const rated = n > 0 || notes.length > 0;
  const grade: Grade | null = override && ORDER.includes(override as Grade) ? (override as Grade) : rated ? auto : null;
  return { rows, n, lateRate, avgLate, overdueBalance, overdueCount: overdue.length, maxOverdue, auto: rated ? auto : null, grade, overridden: !!override && grade !== auto, recentHigh };
}

export async function loadRating(supabase: any, customerId: string, override?: string | null) {
  const [inv, notes] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, status, total, invoice_date, due_date").eq("customer_id", customerId),
    supabase.from("customer_notes").select("id, category, severity, note, created_at, created_by_name, project_id").eq("customer_id", customerId).order("created_at", { ascending: false }),
  ]);
  const invoices: RatingInvoice[] = inv.data ?? [];
  const ids = invoices.map((i) => i.id);
  const pay = ids.length ? await supabase.from("invoice_payments").select("invoice_id, paid_on, amount").in("invoice_id", ids) : { data: [] };
  const noteList: RatingNote[] = notes.error ? [] : notes.data ?? [];
  return { result: computeRating(invoices, pay.data ?? [], noteList, override), notes: noteList, notesAvailable: !notes.error };
}

export const GRADE_COLOR: Record<Grade, string> = { A: "#2fa763", B: "#3b82d6", C: "#d99a0b", D: "#e0523f" };
