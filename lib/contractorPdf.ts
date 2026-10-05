// Builds the contractor payment statement PDF (one contractor, one page-set).
// Drawn directly with jsPDF (no screenshotting) so text stays crisp and the
// table paginates cleanly.

export type ContractorPdfRow = {
  woNumber: string;
  date: string | null; // YYYY-MM-DD — latest task date on that work order
  address: string;
  exGst: number;
};

export type ContractorPdfInput = {
  contractorName: string;
  gstRegistered: boolean;
  rows: ContractorPdfRow[];
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

function parseDay(d: string): Date {
  return new Date(`${d}T00:00:00`);
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const dShort = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const dFull = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** Pay week derived from the work dates (Mon–Sun). Spans several weeks if the lines do. */
export function payWeek(dates: (string | null)[]): { label: string; range: string } {
  const valid = dates.filter((d): d is string => !!d).sort();
  if (valid.length === 0) return { label: "—", range: "No work dates" };
  const first = mondayOf(parseDay(valid[0]));
  const lastMon = mondayOf(parseDay(valid[valid.length - 1]));
  const lastSun = new Date(lastMon);
  lastSun.setDate(lastSun.getDate() + 6);
  const w1 = isoWeek(first);
  const w2 = isoWeek(lastMon);
  return {
    label: w1 === w2 && first.getTime() === lastMon.getTime() ? `Week ${w1}` : `Weeks ${w1}–${w2}`,
    range: `${dShort(first)} – ${dFull(lastSun)}`,
  };
}

export async function downloadContractorPdf(input: ContractorPdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const L = 14;
  const R = 196;
  const rows = [...input.rows].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const exGst = rows.reduce((s, r) => s + r.exGst, 0);
  const gst = input.gstRegistered ? exGst * 0.1 : 0;
  const total = exGst + gst;
  const week = payWeek(rows.map((r) => r.date));
  const today = new Date();

  // Header band
  doc.setFillColor(20, 20, 19);
  doc.roundedRect(L, 14, R - L, 26, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Better Batt Insulation", L + 6, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(201, 198, 191);
  doc.text("Contractor Payment Statement", L + 6, 31);
  doc.setFontSize(7.5);
  doc.text("PAY WEEK", R - 6, 21, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(week.label, R - 6, 28, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(201, 198, 191);
  doc.text(week.range, R - 6, 34, { align: "right" });

  // Info boxes
  const boxW = (R - L - 8) / 3;
  const boxes: [string, string, string][] = [
    ["CONTRACTOR", input.contractorName, input.gstRegistered ? "GST registered" : "Not registered for GST"],
    ["STATEMENT DATE", dFull(today), `${new Set(rows.map((r) => r.woNumber)).size} work order(s)`],
    ["PAY WEEK", week.label, week.range],
  ];
  boxes.forEach(([label, big, small], i) => {
    const x = L + i * (boxW + 4);
    doc.setFillColor(246, 245, 242);
    doc.roundedRect(x, 46, boxW, 18, 2, 2, "F");
    doc.setTextColor(107, 104, 98);
    doc.setFontSize(7);
    doc.text(label, x + 3, 51);
    doc.setTextColor(20, 20, 19);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(big, boxW - 6)[0], x + 3, 57);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(85, 82, 76);
    doc.text(doc.splitTextToSize(small, boxW - 6)[0], x + 3, 61.5);
  });

  // Table
  const cWo = L + 2;
  const cDate = 40;
  const cAddr = 66;
  const cEx = 140;
  const cGst = 166;
  const cTot = R - 2;
  let y = 72;

  const tableHead = () => {
    doc.setFillColor(246, 245, 242);
    doc.roundedRect(L, y - 5, R - L, 8, 1.5, 1.5, "F");
    doc.setTextColor(107, 104, 98);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("WORK ORDER", cWo, y);
    doc.text("DATE", cDate, y);
    doc.text("JOB ADDRESS", cAddr, y);
    doc.text("EX GST", cEx, y, { align: "right" });
    doc.text("GST", cGst, y, { align: "right" });
    doc.text("TOTAL", cTot, y, { align: "right" });
    y += 7;
  };
  tableHead();

  for (const r of rows) {
    const addrLines: string[] = doc.splitTextToSize(r.address || "—", 70);
    const h = Math.max(9, addrLines.length * 4.4 + 4);
    if (y + h > 262) {
      doc.addPage();
      y = 20;
      tableHead();
    }
    const rGst = input.gstRegistered ? r.exGst * 0.1 : 0;
    doc.setTextColor(20, 20, 19);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(r.woNumber, cWo, y);
    doc.setFont("helvetica", "normal");
    doc.text(r.date ? dFull(parseDay(r.date)) : "—", cDate, y);
    doc.text(addrLines, cAddr, y);
    doc.text(money(r.exGst), cEx, y, { align: "right" });
    doc.text(money(rGst), cGst, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(money(r.exGst + rGst), cTot, y, { align: "right" });
    doc.setDrawColor(236, 233, 227);
    doc.line(L, y + h - 5.5, R, y + h - 5.5);
    y += h;
  }

  // Totals
  if (y + 36 > 280) {
    doc.addPage();
    y = 20;
  }
  y += 4;
  const tx = R - 80;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(85, 82, 76);
  doc.text("Total due ex GST", tx, y);
  doc.setTextColor(20, 20, 19);
  doc.setFont("helvetica", "bold");
  doc.text(money(exGst), R, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(85, 82, 76);
  doc.text(input.gstRegistered ? "GST (10%)" : "GST (not registered)", tx, y);
  doc.setTextColor(20, 20, 19);
  doc.setFont("helvetica", "bold");
  doc.text(money(gst), R, y, { align: "right" });
  y += 4;
  doc.setFillColor(20, 20, 19);
  doc.roundedRect(tx - 4, y, R - tx + 4, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(input.gstRegistered ? "Total due inc GST" : "Total payable", tx, y + 7.5);
  doc.setFontSize(13);
  doc.text(money(total), R - 3, y + 8, { align: "right" });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(236, 233, 227);
    doc.line(L, 281, R, 281);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 104, 98);
    doc.text("Better Batt Insulation · betterbattinsulation.com.au", L, 286);
    doc.text(`Page ${p} of ${pages}`, R, 286, { align: "right" });
  }

  const safeName = input.contractorName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  doc.save(`Contractor-Payment-${safeName}-${week.label.replace(/\s+/g, "")}.pdf`);
}
