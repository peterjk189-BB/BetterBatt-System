// Server-side invoice PDF (jsPDF, text only so it stays crisp).
import { money, fmtDate, invNo, type Invoice } from "@/lib/invoices";
import { LOGO_PNG_DATA_URL } from "@/lib/logoData";

export type InvoicePdfInput = {
  invoice: Invoice;
  customerName: string;
  customerEmail?: string | null;
  siteAddress?: string | null;
  deliveryAddress?: string | null;
  quoteNumber?: number | null;
  paid: number;
  lines?: { description: string; qty: number; unit_price: number; line_ex: number }[];
  company: { abn?: string | null; phone?: string | null; bankDetails?: string | null; footer?: string | null };
};

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const { invoice: inv, company } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  let y = M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("TAX INVOICE", W - M, y + 2, { align: "right" });
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

  // meta block (right)
  let my = M + 10;
  const meta: [string, string][] = [
    ["Invoice no.", invNo(inv.invoice_number)],
    ["Invoice date", fmtDate(inv.invoice_date)],
    ["Due date", fmtDate(inv.due_date)],
  ];
  if (input.quoteNumber) meta.push(["Quote ref", `Q${input.quoteNumber}`]);
  if (inv.customer_po) meta.push(["Your PO", inv.customer_po]);
  doc.setFontSize(9.5);
  for (const [k, v] of meta) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text(k, W - M - 45, my);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(v, W - M, my, { align: "right" });
    my += 5;
  }

  y = Math.max(y, my) + 10;
  const colW = (W - M * 2) / 2 - 6;
  const RX = W / 2 + 6; // right column (delivery address)
  const top = y;

  // left: BILL TO
  let ly = top;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("BILL TO", M, ly);
  doc.setTextColor(0);
  ly += 5;
  doc.setFontSize(11);
  for (const l of doc.splitTextToSize(input.customerName || "—", colW) as string[]) { doc.text(l, M, ly); ly += 5; }
  ly -= 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  if (input.customerEmail) { ly += 5; doc.text(input.customerEmail, M, ly); }
  if (input.siteAddress) {
    for (const l of doc.splitTextToSize(`Job site: ${input.siteAddress}`, colW) as string[]) { ly += 5; doc.text(l, M, ly); }
  }

  // right: DELIVERY ADDRESS
  let ry = top;
  if (input.deliveryAddress) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text("DELIVERY ADDRESS", RX, ry);
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const parts = input.deliveryAddress.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    ry += 5;
    for (const part of parts) {
      for (const l of doc.splitTextToSize(part, colW) as string[]) { doc.text(l, RX, ry); ry += 5; }
    }
    ry -= 5;
  }
  y = Math.max(ly, ry);

  // line table
  y += 12;
  doc.setFillColor(242, 240, 236);
  doc.rect(M, y - 5, W - M * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const lines = input.lines ?? [];
  const num = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2));
  if (lines.length > 0) {
    doc.text("Item", M + 2, y);
    doc.text("Qty", W - M - 78, y, { align: "right" });
    doc.text("Unit (ex GST)", W - M - 32, y, { align: "right" });
    doc.text("Amount (ex GST)", W - M - 2, y, { align: "right" });
    y += 9;
    doc.setFont("helvetica", "normal");
    for (const l of lines) {
      const wrapped = doc.splitTextToSize(l.description || "", W - M * 2 - 90) as string[];
      const h = Math.max(1, wrapped.length) * 4.8;
      if (y + h > 262) {
        doc.addPage();
        y = M + 6;
      }
      doc.text(wrapped, M + 2, y);
      doc.text(num(l.qty), W - M - 78, y, { align: "right" });
      doc.text(money(l.unit_price), W - M - 32, y, { align: "right" });
      doc.text(money(l.line_ex), W - M - 2, y, { align: "right" });
      y += h + 2;
    }
    y += 2;
    if (inv.description) {
      doc.setTextColor(110);
      doc.setFontSize(8.5);
      const dl = doc.splitTextToSize(inv.description, W - M * 2) as string[];
      doc.text(dl, M + 2, y);
      y += dl.length * 4.2 + 2;
      doc.setTextColor(0);
      doc.setFontSize(9.5);
    }
  } else {
    doc.text("Description", M + 2, y);
    doc.text("Amount (ex GST)", W - M - 2, y, { align: "right" });
    y += 9;
    doc.setFont("helvetica", "normal");
    const desc = inv.description || `${inv.kind} invoice`;
    const dl = doc.splitTextToSize(desc, W - M * 2 - 50) as string[];
    doc.text(dl, M + 2, y);
    doc.text(money(inv.amount_ex_gst), W - M - 2, y, { align: "right" });
    y += dl.length * 4.8 + 4;
  }
  doc.setDrawColor(210);
  doc.line(M, y, W - M, y);

  // totals
  y += 8;
  const tx = W - M - 60;
  const row = (k: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.text(k, tx, y);
    doc.text(v, W - M - 2, y, { align: "right" });
    y += bold ? 7 : 5.5;
  };
  row("Subtotal (ex GST)", money(inv.amount_ex_gst));
  row("GST (10%)", money(inv.gst));
  row("Total (inc GST)", money(inv.total), true);
  if (input.paid > 0) {
    row("Paid to date", `-${money(input.paid)}`);
    row("Balance due", money(Math.max(0, inv.total - input.paid)), true);
  }

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Payment", M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  const payLines = [
    inv.terms ? `Terms: ${inv.terms}` : "",
    `Please quote ${invNo(inv.invoice_number)} with your payment.`,
    ...(company.bankDetails ? (company.bankDetails.split("\n") as string[]) : []),
  ].filter(Boolean);
  for (const l of payLines) {
    doc.text(l, M, y);
    y += 4.8;
  }
  if (inv.notes) {
    y += 3;
    const nl = doc.splitTextToSize(inv.notes, W - M * 2) as string[];
    doc.text(nl, M, y);
    y += nl.length * 4.8;
  }
  if (company.footer) {
    y += 6;
    doc.setTextColor(110);
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(company.footer, W - M * 2) as string[], M, y);
  }
  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}
