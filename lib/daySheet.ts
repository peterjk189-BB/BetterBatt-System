// "Day sheet": every authorised job a contractor has on one date, as ONE PDF (cover summary + a page per work order).
import { LOGO_PNG_DATA_URL } from "@/lib/logoData";
import { lineRate } from "@/lib/woRate";
import { woLinePacks } from "@/lib/picking";

export type DayLine = { product: string; note: string; qty: number; packs: number | null; cost: number };
export type DayJob = {
  woId: string;
  woNumber: string;
  quoteNumber: number | null;
  customer: string;
  site: string;
  notes: string;
  jsa: boolean;
  lines: DayLine[];
  m2: number;
  total: number;
};
export type DaySheet = {
  contractorId: string;
  contractorName: string;
  contractorPhone: string;
  contractorEmail: string;
  date: string;
  jobs: DayJob[];
  /** Work orders with lines that day that were left out because the office hasn't authorised them yet. */
  heldBack: string[];
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
export function longDate(d: string) {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function shortDate(d: string) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Loads one contractor's jobs for one date. Pass a signed-in staff client (or the admin client). */
export async function loadDaySheet(supabase: any, subId: string, date: string): Promise<DaySheet | null> {
  const { data: sub } = await supabase.from("subcontractors").select("id, name, phone, email").eq("id", subId).single();
  if (!sub) return null;
  const { data: rows } = await supabase
    .from("work_order_lines")
    .select(
      "id, task_date, qty, note, rate, sort_order, subcontractor_id, work_order_id, parts(name, installer_rate_per_m2, coverage_m2, is_stock_item), labour_items(code, description, contractor_rate), work_orders(*, projects(quote_number, lot_no, address, suburb, customers(name)))"
    )
    .eq("task_date", date)
    .order("sort_order");

  const byWo = new Map<string, DayJob>();
  const heldBack: string[] = [];
  for (const r of (rows ?? []) as any[]) {
    const wo = Array.isArray(r.work_orders) ? r.work_orders[0] : r.work_orders;
    if (!wo || wo.archived) continue;
    // A line belongs to its own contractor, or to the work order's contractor when it has none.
    const owner = r.subcontractor_id || wo.contractor_id;
    if (owner !== subId) continue;
    if ("authorised_at" in wo && !wo.authorised_at) {
      if (!heldBack.includes(wo.wo_number)) heldBack.push(wo.wo_number);
      continue;
    }
    if (/delivery/i.test(r.parts?.name || "")) continue;
    const p = Array.isArray(wo.projects) ? wo.projects[0] : wo.projects;
    let job = byWo.get(wo.id);
    if (!job) {
      const lot = p?.lot_no ? (/^lot\b/i.test(p.lot_no.trim()) ? p.lot_no.trim() : `Lot ${p.lot_no.trim()}`) : "";
      job = {
        woId: wo.id,
        woNumber: String(wo.wo_number),
        quoteNumber: p?.quote_number ?? null,
        customer: p?.customers?.name || "",
        site: [lot, p?.address, p?.suburb].filter(Boolean).join(", "),
        notes: (wo.notes || "").trim(),
        jsa: !!wo.jsa_received,
        lines: [],
        m2: 0,
        total: 0,
      };
      byWo.set(wo.id, job);
    }
    const rate = lineRate(r.rate, r.labour_items?.contractor_rate, r.parts?.installer_rate_per_m2);
    const qty = Number(r.qty) || 0;
    const cost = qty * rate;
    job.lines.push({
      product: r.parts?.name || r.labour_items?.description || "—",
      note: r.note || "",
      qty,
      packs: woLinePacks(qty, r.parts),
      cost,
    });
    job.m2 += qty;
    job.total += cost;
  }
  const jobs = Array.from(byWo.values()).sort((a, b) => a.woNumber.localeCompare(b.woNumber, undefined, { numeric: true }));
  return {
    contractorId: sub.id,
    contractorName: sub.name,
    contractorPhone: sub.phone || "",
    contractorEmail: sub.email || "",
    date,
    jobs,
    heldBack,
  };
}

export async function buildDaySheetPdf(ds: DaySheet): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 15;
  const R = W - M;
  const GREY: [number, number, number] = [249, 250, 251];
  const LABEL: [number, number, number] = [107, 114, 128];

  const band = (y: number, kicker: string, title: string, big: string) => {
    doc.setFillColor(20, 20, 19);
    doc.roundedRect(M, y, R - M, 24, 3, 3, "F");
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M + 5, y + 6, 26, 12, 1.2, 1.2, "F");
    try {
      doc.addImage(LOGO_PNG_DATA_URL, "PNG", M + 5.6, y + 6.4, 24.8, 11.2);
    } catch {
      /* logo is optional */
    }
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Better Batt Insulation", M + 36, y + 11.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(209, 213, 219);
    doc.text(title, M + 36, y + 16.5);
    doc.setFontSize(7.5);
    doc.text(kicker, R - 5, y + 8.5, { align: "right" });
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(big.length > 14 ? 12 : 18);
    doc.text(big, R - 5, y + 17.5, { align: "right" });
    return y + 24 + 6;
  };
  const label = (t: string, x: number, y: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...LABEL);
    doc.text(t.toUpperCase(), x, y);
  };
  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text("Better Batt Insulation", M, H - 8);
    doc.text(`${ds.contractorName} · ${longDate(ds.date)}`, R, H - 8, { align: "right" });
  };

  // ---- everything on one page (flows onto a second page only if there are too many jobs to fit)
  let y = band(M, "DAY SHEET", `Jobs for ${ds.contractorName}`, shortDate(ds.date));
  const totalM2 = ds.jobs.reduce((s, j) => s + j.m2, 0);
  const grand = ds.jobs.reduce((s, j) => s + j.total, 0);
  doc.setFillColor(...GREY);
  doc.roundedRect(M, y, R - M, 14, 2, 2, "F");
  label("Contractor", M + 3, y + 4.4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(ds.contractorName, M + 3, y + 9.4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text([ds.contractorPhone, ds.contractorEmail].filter(Boolean).join(" · "), M + 3, y + 12.8);
  label("Jobs / total m²", R - 3 - 45, y + 4.4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`${ds.jobs.length} job${ds.jobs.length === 1 ? "" : "s"} · ${Math.round(totalM2 * 10) / 10} m²`, R - 3 - 45, y + 9.4);
  y += 14 + 6;

  const c = { prod: M + 3, note: M + 70, qty: R - 50, packs: R - 33, cost: R - 3 };
  const newPage = () => {
    footer();
    doc.addPage();
    y = M;
  };
  for (const j of ds.jobs) {
    const site = doc.splitTextToSize(`${j.site || "—"}${j.customer ? "  ·  " + j.customer : ""}`, R - M - 34) as string[];
    const headH = 5 + site.length * 4.2 + 2;
    if (y + headH + 12 > H - 18) newPage();
    // job header strip
    doc.setFillColor(...GREY);
    doc.roundedRect(M, y, R - M, headH, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(j.woNumber, M + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(55, 65, 81);
    site.forEach((t, k) => doc.text(t, M + 28, y + 5 + k * 4.2));
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(`${Math.round(j.m2 * 10) / 10} m²`, R - 3, y + 5, { align: "right" });
    y += headH + 1.5;
    for (const l of j.lines) {
      const prod = doc.splitTextToSize(l.product, 64) as string[];
      const note = doc.splitTextToSize(l.note || "", 58) as string[];
      const rows = Math.max(prod.length, note.length, 1);
      if (y + rows * 4 + 2 > H - 18) newPage();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(55, 65, 81);
      prod.forEach((t, k) => doc.text(t, c.prod, y + 3.2 + k * 4));
      doc.setTextColor(0);
      note.forEach((t, k) => doc.text(t, c.note, y + 3.2 + k * 4));
      doc.text(String(Math.round(l.qty * 100) / 100), c.qty, y + 3.2, { align: "right" });
      doc.text(l.packs == null ? "" : `${l.packs} pk`, c.packs, y + 3.2, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(money(l.cost), c.cost, y + 3.2, { align: "right" });
      y += rows * 4 + 1.6;
      doc.setDrawColor(240, 240, 240);
      doc.line(M, y - 0.6, R, y - 0.6);
    }
    if (j.notes) {
      const nl = doc.splitTextToSize("Notes: " + j.notes, R - M - 6) as string[];
      if (y + nl.length * 4 + 3 > H - 18) newPage();
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(75, 85, 99);
      nl.forEach((t, k) => doc.text(t, M + 3, y + 3.4 + k * 4));
      y += nl.length * 4 + 2;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`JSA received: ${j.jsa ? "Yes" : "No"}`, M + 3, y + 3.4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0);
    doc.text(`Job total ${money(j.total)}`, R - 3, y + 3.4, { align: "right" });
    y += 9;
  }
  if (ds.jobs.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text("No authorised jobs on this date.", M, y + 6);
  } else {
    if (y + 8 > H - 18) newPage();
    doc.setDrawColor(209, 213, 219);
    doc.line(M, y - 3, R, y - 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Total for the day: ${money(grand)} (ex GST)`, R, y + 2, { align: "right" });
  }
  footer();
  return new Uint8Array(doc.output("arraybuffer"));
}
