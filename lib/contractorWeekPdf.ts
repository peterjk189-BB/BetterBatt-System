// Weekly contractor payments summary PDF: every contractor with work in the week (Mon–Sun) on one report.
// Drawn with jsPDF like lib/contractorPdf.ts so the text stays crisp and the table paginates cleanly.

export type WeekPdfContractor = {
  name: string;
  gstRegistered: boolean;
  jobs: number; // distinct work orders
  exGst: number; // everything in the week (paid + unpaid)
  paidExGst: number;
  unpaidExGst: number;
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const dFull = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function mondayOfDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function downloadWeekSummaryPdf(weekStart: string, rows: WeekPdfContractor[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const L = 14;
  const R = 283;
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${addDays(weekStart, 6)}T00:00:00`);
  const range = `${dFull(start)} – ${dFull(end)}`;
  const list = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const gstOf = (r: WeekPdfContractor, v: number) => (r.gstRegistered ? v * 0.1 : 0);

  const tot = list.reduce(
    (t, r) => ({
      jobs: t.jobs + r.jobs,
      ex: t.ex + r.exGst,
      gst: t.gst + gstOf(r, r.exGst),
      inc: t.inc + r.exGst + gstOf(r, r.exGst),
      paid: t.paid + r.paidExGst + gstOf(r, r.paidExGst),
      unpaid: t.unpaid + r.unpaidExGst + gstOf(r, r.unpaidExGst),
    }),
    { jobs: 0, ex: 0, gst: 0, inc: 0, paid: 0, unpaid: 0 }
  );

  // Header band
  doc.setFillColor(20, 20, 19);
  doc.roundedRect(L, 12, R - L, 24, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Better Batt Insulation", L + 6, 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(201, 198, 191);
  doc.text("Contractor payments — weekly summary", L + 6, 29.5);
  doc.setFontSize(7.5);
  doc.text("WEEK (MON–SUN)", R - 6, 19, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(range, R - 6, 27, { align: "right" });

  // Headline tiles
  const tiles: [string, string][] = [
    ["CONTRACTORS", String(list.length)],
    ["JOBS", String(tot.jobs)],
    ["TOTAL EX GST", money(tot.ex)],
    ["TOTAL INC GST", money(tot.inc)],
    ["PAID", money(tot.paid)],
    ["STILL TO PAY", money(tot.unpaid)],
  ];
  const tw = (R - L - 5 * 3) / 6;
  tiles.forEach(([k, v], i) => {
    const x = L + i * (tw + 3);
    doc.setFillColor(246, 245, 242);
    doc.roundedRect(x, 41, tw, 16, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(107, 104, 98);
    doc.text(k, x + 3, 46.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(k === "STILL TO PAY" && tot.unpaid > 0.004 ? 185 : 20, k === "STILL TO PAY" && tot.unpaid > 0.004 ? 28 : 20, k === "STILL TO PAY" && tot.unpaid > 0.004 ? 28 : 19);
    doc.text(v, x + 3, 53.5);
  });

  // Table
  const c = { name: L + 2, gst: 92, jobs: 112, ex: 140, g: 166, inc: 194, paid: 224, unpaid: R - 2 };
  let y = 66;
  const head = () => {
    doc.setFillColor(246, 245, 242);
    doc.roundedRect(L, y - 5, R - L, 8, 1.5, 1.5, "F");
    doc.setTextColor(107, 104, 98);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("CONTRACTOR", c.name, y);
    doc.text("GST REG.", c.gst, y);
    doc.text("JOBS", c.jobs, y, { align: "right" });
    doc.text("EX GST", c.ex, y, { align: "right" });
    doc.text("GST", c.g, y, { align: "right" });
    doc.text("TOTAL INC GST", c.inc, y, { align: "right" });
    doc.text("PAID", c.paid, y, { align: "right" });
    doc.text("STILL TO PAY", c.unpaid, y, { align: "right" });
    y += 8;
  };
  head();

  for (const r of list) {
    if (y > 184) {
      doc.addPage();
      y = 20;
      head();
    }
    const g = gstOf(r, r.exGst);
    const paid = r.paidExGst + gstOf(r, r.paidExGst);
    const unpaid = r.unpaidExGst + gstOf(r, r.unpaidExGst);
    doc.setFontSize(9.5);
    doc.setTextColor(20, 20, 19);
    doc.setFont("helvetica", "bold");
    doc.text(doc.splitTextToSize(r.name, 70)[0], c.name, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(85, 82, 76);
    doc.text(r.gstRegistered ? "Yes" : "No", c.gst, y);
    doc.setTextColor(20, 20, 19);
    doc.text(String(r.jobs), c.jobs, y, { align: "right" });
    doc.text(money(r.exGst), c.ex, y, { align: "right" });
    doc.text(r.gstRegistered ? money(g) : "—", c.g, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(money(r.exGst + g), c.inc, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(money(paid), c.paid, y, { align: "right" });
    if (unpaid > 0.004) doc.setTextColor(185, 28, 28);
    doc.setFont("helvetica", "bold");
    doc.text(money(unpaid), c.unpaid, y, { align: "right" });
    doc.setDrawColor(236, 233, 227);
    doc.line(L, y + 3, R, y + 3);
    y += 9;
  }

  if (list.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 104, 98);
    doc.text("No contractor work recorded for this week.", c.name, y);
  } else {
    if (y > 184) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(20, 20, 19);
    doc.roundedRect(L, y - 3, R - L, 11, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text("TOTAL", c.name, y + 3.5);
    doc.text(String(tot.jobs), c.jobs, y + 3.5, { align: "right" });
    doc.text(money(tot.ex), c.ex, y + 3.5, { align: "right" });
    doc.text(money(tot.gst), c.g, y + 3.5, { align: "right" });
    doc.text(money(tot.inc), c.inc, y + 3.5, { align: "right" });
    doc.text(money(tot.paid), c.paid, y + 3.5, { align: "right" });
    doc.text(money(tot.unpaid), c.unpaid, y + 3.5, { align: "right" });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(236, 233, 227);
    doc.line(L, 198, R, 198);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 104, 98);
    doc.text(`Better Batt Insulation · work done ${range} · printed ${dFull(new Date())} · GST added at 10% for GST-registered contractors only`, L, 203);
    doc.text(`Page ${p} of ${pages}`, R, 203, { align: "right" });
  }
  doc.save(`Contractor-Payments-Week-${weekStart}.pdf`);
}
