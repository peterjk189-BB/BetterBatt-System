// Server-side customer statement PDF (jsPDF, text only so it stays crisp).
import { fmtDate, invNo, money } from "@/lib/invoices";
import { BUCKET_LABELS, type Ageing, type StatementRow } from "@/lib/statements";
import { LOGO_PNG_DATA_URL } from "@/lib/logoData";

export type StatementPdfInput = {
  customer: { name: string; accounts_contact_name?: string | null; accounts_contact_email?: string | null; contact_email?: string | null; payment_terms?: string | null };
  asOf: string;
  rows: StatementRow[];
  ageing: Ageing;
  recent: { invoice_number: number; paid_on: string; amount: number; method?: string | null; reference?: string | null }[];
  company: { abn?: string | null; phone?: string | null; bankDetails?: string | null; footer?: string | null };
};

export async function buildStatementPdf(input: StatementPdfInput): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const { customer, rows, ageing, recent, company } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  const R = W - M;
  let y = M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("STATEMENT", R, y + 2, { align: "right" });
  try {
    doc.addImage(LOGO_PNG_DATA_URL, "PNG", M, M - 5, 44, 22);
  } catch {
    doc.setFontSize(15);
    doc.text("Better Batt Insulation", M, y + 2);
  }
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(90);
  if (company.abn) { doc.text(`ABN ${company.abn}`, M, y); y += 4.5; }
  if (company.phone) { doc.text(company.phone, M, y); y += 4.5; }
  doc.text("betterbattinsulation.com.au", M, y);
  doc.setTextColor(0);

  // meta (right)
  let my = M + 10;
  for (const [k, v] of [["Statement date", fmtDate(input.asOf)], ["Terms", customer.payment_terms || "—"]] as [string, string][]) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text(k, R - 45, my);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(v, R, my, { align: "right" });
    my += 5;
  }

  y = Math.max(y, my) + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("ACCOUNT", M, y);
  doc.setTextColor(0);
  y += 5;
  doc.setFontSize(11);
  doc.text(customer.name || "—", M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  if (customer.accounts_contact_name) { doc.text(`Attn: ${customer.accounts_contact_name}`, M, y); y += 4.8; }

  // amount owing banner
  y += 4;
  doc.setFillColor(242, 240, 236);
  doc.rect(M, y, R - M, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total amount owing (inc GST)", M + 3, y + 7.6);
  doc.setFontSize(14);
  doc.text(money(ageing.total), R - 3, y + 8, { align: "right" });
  y += 20;

  // open items table
  const cols = { inv: M + 2, date: M + 24, due: M + 48, ref: M + 72, total: R - 56, paid: R - 30, bal: R - 2 };
  const header = () => {
    doc.setFillColor(242, 240, 236);
    doc.rect(M, y - 5, R - M, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Invoice", cols.inv, y);
    doc.text("Date", cols.date, y);
    doc.text("Due", cols.due, y);
    doc.text("Your PO / details", cols.ref, y);
    doc.text("Amount", cols.total, y, { align: "right" });
    doc.text("Paid", cols.paid, y, { align: "right" });
    doc.text("Balance", cols.bal, y, { align: "right" });
    y += 8;
    doc.setFont("helvetica", "normal");
  };
  header();
  doc.setFontSize(9);
  if (rows.length === 0) {
    doc.setTextColor(110);
    doc.text("No outstanding invoices.", cols.inv, y);
    doc.setTextColor(0);
    y += 7;
  }
  for (const r of rows) {
    if (y > 262) {
      doc.addPage();
      y = M + 6;
      header();
      doc.setFontSize(9);
    }
    const ref = r.invoice.customer_po || r.invoice.description || "";
    const refLines = doc.splitTextToSize(ref, cols.total - cols.ref - 18) as string[];
    doc.text(invNo(r.invoice.invoice_number), cols.inv, y);
    doc.text(fmtDate(r.invoice.invoice_date), cols.date, y);
    if (r.daysOverdue > 0) doc.setTextColor(180, 30, 30);
    doc.text(fmtDate(r.due), cols.due, y);
    doc.setTextColor(0);
    doc.text(refLines.slice(0, 2), cols.ref, y);
    doc.text(money(r.invoice.total), cols.total, y, { align: "right" });
    doc.text(r.paid > 0 ? money(r.paid) : "—", cols.paid, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(money(r.balance), cols.bal, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += Math.max(1, Math.min(2, refLines.length)) * 4.6 + 1.4;
    doc.setDrawColor(225);
    doc.line(M, y - 3.2, R, y - 3.2);
  }

  // ageing
  if (y > 236) {
    doc.addPage();
    y = M + 6;
  }
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AGEING", M, y);
  y += 5;
  const keys = ["current", "d1_30", "d31_60", "d61"] as const;
  const cw = (R - M) / 5;
  doc.setFillColor(242, 240, 236);
  doc.rect(M, y - 4.5, R - M, 7.5, "F");
  keys.forEach((k, i) => doc.text(BUCKET_LABELS[k], M + cw * i + cw - 3, y, { align: "right" }));
  doc.text("Total", M + cw * 4 + cw - 3, y, { align: "right" });
  y += 7;
  doc.setFont("helvetica", "normal");
  keys.forEach((k, i) => doc.text(money(ageing[k]), M + cw * i + cw - 3, y, { align: "right" }));
  doc.setFont("helvetica", "bold");
  doc.text(money(ageing.total), M + cw * 4 + cw - 3, y, { align: "right" });
  y += 8;

  // recent payments
  if (recent.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = M + 6;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PAYMENTS RECEIVED (LAST 60 DAYS)", M, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    for (const p of recent.slice(0, 12)) {
      doc.text(`${fmtDate(p.paid_on)}   ${invNo(p.invoice_number)}   ${[p.method, p.reference].filter(Boolean).join(" · ")}`, M + 2, y);
      doc.text(money(p.amount), R - 2, y, { align: "right" });
      y += 4.8;
    }
    y += 3;
  }

  // payment details
  if (y > 250) {
    doc.addPage();
    y = M + 6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Payment", M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  for (const l of ["Please quote the invoice number with your payment.", ...(company.bankDetails ? company.bankDetails.split("\n") : [])].filter(Boolean)) {
    doc.text(l, M, y);
    y += 4.8;
  }
  if (company.footer) {
    y += 4;
    doc.setTextColor(110);
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(company.footer, R - M) as string[], M, y);
  }
  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}
