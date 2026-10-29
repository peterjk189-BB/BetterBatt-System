export type Invoice = {
  id: string;
  invoice_number: number;
  project_id: string | null;
  customer_id: string | null;
  kind: "Deposit" | "Balance" | "Full" | "Progress" | "Other" | "Items";
  description: string | null;
  amount_ex_gst: number;
  gst: number;
  total: number;
  invoice_date: string;
  due_date: string | null;
  terms: string | null;
  customer_po: string | null;
  site_address?: string | null;
  delivery_address?: string | null;
  delivery_method?: "delivery" | "pickup";
  delivery_date?: string | null;
  delivery_note?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_time?: string | null;
  discount_type?: "amount" | "percent";
  discount_value?: number;
  discount_ex_gst?: number;
  discount_label?: string | null;
  notes: string | null;
  status: "Draft" | "Sent" | "Void";
  sent_at: string | null;
  qb_exported_at: string | null;
  qb_ref: string | null;
  created_at: string;
};

export type Payment = { id: string; invoice_id: string; paid_on: string; amount: number; method: string | null; reference: string | null };

export const KINDS = ["Deposit", "Balance", "Full", "Progress", "Other", "Items"] as const;

export type InvoiceLine = { id: string; invoice_id: string; part_id: string | null; description: string; qty: number; unit_price: number; line_ex: number; sort_order: number; fulfilment?: "warehouse" | "supplier"; picked?: boolean; multi_picked?: number | null; packs_picked?: number | null; po_id?: string | null };
export const PAY_METHODS = ["Bank transfer", "Card", "Cash", "Cheque", "Other"] as const;
export const invNo = (n: number) => `INV-${n}`;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Due date from a customer's payment terms ('7 Days' | '30 Days' | 'COD' | 'Payment in advance' | 'Deposit Account'). Deposits, COD, payment in advance and deposit accounts are all due on issue. */
export function dueFromTerms(kind: string, terms: string | null | undefined, invoiceDate: string) {
  if (kind === "Deposit") return invoiceDate;
  if (terms === "30 Days") return addDays(invoiceDate, 30);
  if (terms === "14 Days") return addDays(invoiceDate, 14);
  if (terms === "7 Days") return addDays(invoiceDate, 7);
  return invoiceDate; // COD, payment in advance, deposit account: due on issue
}

export type DerivedStatus = "Draft" | "Sent" | "Part paid" | "Paid" | "Overdue" | "Void";

export function paidTotal(payments: Payment[]) {
  return round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
}

export function derivedStatus(inv: Invoice, paid: number): DerivedStatus {
  if (inv.status === "Void") return "Void";
  if (paid >= inv.total - 0.005 && inv.total > 0) return "Paid";
  if (inv.status === "Draft") return "Draft";
  if (inv.due_date && inv.due_date < today()) return "Overdue";
  if (paid > 0) return "Part paid";
  return "Sent";
}

export const STATUS_STYLE: Record<DerivedStatus, string> = {
  Draft: "bg-gray-200 text-gray-700",
  Sent: "bg-blue-100 text-blue-800",
  "Part paid": "bg-[#fff4d6] text-[#7a5a0f]",
  Paid: "bg-green-100 text-green-800",
  Overdue: "bg-[#fde8e8] text-[#b91c1c]",
  Void: "bg-gray-200 text-gray-500 line-through",
};

export const money = (n: number) => Number(n || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
export const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU") : "—");

/**
 * Totals from a pre-adjustment subtotal (ex GST) and an adjustment that is a dollar amount or a percentage.
 * A positive value is a discount (taken off); a negative value is an extra charge (added on).
 * discount_ex_gst holds the dollars taken off (negative when charges are added).
 */
export function invoiceTotals(subtotal: number, type: "amount" | "percent" | undefined, value: number | undefined) {
  const sub = round2(Number(subtotal) || 0);
  const v = Number(value) || 0;
  const raw = type === "percent" ? (sub * Math.max(-1000, Math.min(100, v))) / 100 : v;
  const discount = round2(Math.min(sub, raw));
  const ex = round2(sub - discount);
  const gst = round2(ex * 0.1);
  return { discount_ex_gst: discount, amount_ex_gst: ex, gst, total: round2(ex + gst) };
}
