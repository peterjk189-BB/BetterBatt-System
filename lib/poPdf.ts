// Server-side purchase order PDF (jsPDF), laid out like the on-screen PO page:
// dark header band with the PO number, grey info boxes, item table and a totals box.
import { LOGO_PNG_DATA_URL } from "@/lib/logoData";
import { fuelLevyAmount } from "@/lib/poFuel";

export type PoPdfInput = {
  po: {
    po_number: string | null;
    order_date: string | null;
    delivery_date: string | null;
    delivery_time: string | null;
    delivery_address: string | null;
    site_contact_name: string | null;
    site_contact_phone: string | null;
    notes: string | null;
    fuel_levy_type?: string | null;
    fuel_levy_value?: number | null;
  };
  supplier: { name: string; address?: string | null } | null;
  lines: { qty_pks: number; unit_cost: number | null; parts: { code: string | null; name: string } | null }[];
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

function longDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d.length <= 10 ? d + "T00:00:00Z" : d);
  if (isNaN(dt.getTime())) return "—";
  const wd = dt.toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" });
  return `${wd}, ${dt.toLocaleDateString("en-AU", { timeZone: "UTC" })}`;
}

function time12(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

export function poTotals(input: PoPdfInput) {
  const subtotal = input.lines.reduce((s, l) => s + (Number(l.qty_pks) || 0) * (Number(l.unit_cost) || 0), 0);
  const fuel = fuelLevyAmount(subtotal, input.po.fuel_levy_type, input.po.fuel_levy_value);
  const gst = (subtotal + fuel) * 0.1;
  return { subtotal, fuel, gst, total: subtotal + fuel + gst };
}

export async function buildPoPdf(input: PoPdfInput): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const { po, supplier, lines } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 15;
  const R = W - M;
  let y = M;
  const GREY_BG: [number, number, number] = [249, 250, 251];
  const LABEL: [number, number, number] = [107, 114, 128];

  // header band
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
  doc.text("Purchase Order", M + 36, y + 16.5);
  doc.setFontSize(7.5);
  doc.text("PO NUMBER", R - 5, y + 8.5, { align: "right" });
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(po.po_number || "—", R - 5, y + 17.5, { align: "right" });
  y += 24 + 5;

  const box = (x: number, top: number, w: number, label: string, lines: string[], h: number, outline: boolean, small?: string[]) => {
    if (outline) {
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, top, w, h, 2, 2, "S");
    } else {
      doc.setFillColor(...GREY_BG);
      doc.roundedRect(x, top, w, h, 2, 2, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...LABEL);
    doc.text(label.toUpperCase(), x + 3, top + 4.6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0);
    let ty = top + 9.6;
    for (const l of lines) {
      doc.text(l, x + 3, ty);
      ty += 4.6;
    }
    if (small?.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(75, 85, 99);
      for (const l of small) {
        doc.text(l, x + 3, ty);
        ty += 3.9;
      }
    }
  };

  // row 1: supplier / order date / delivery
  const gap = 3;
  const w3 = (R - M - 2 * gap) / 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const supName = doc.splitTextToSize(supplier?.name || "—", w3 - 6) as string[];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const supAddr = supplier?.address ? (doc.splitTextToSize(supplier.address, w3 - 6) as string[]) : [];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const deliv = doc.splitTextToSize([longDate(po.delivery_date), time12(po.delivery_time)].filter((x) => x && x !== "—").join(" · ") || "—", w3 - 6) as string[];
  const orderD = doc.splitTextToSize(longDate(po.order_date), w3 - 6) as string[];
  const h1 = Math.max(15, 9.6 + Math.max(supName.length * 4.6 + supAddr.length * 3.9, deliv.length * 4.6, orderD.length * 4.6) + 2.5);
  box(M, y, w3, "Supplier", supName, h1, false, supAddr);
  box(M + w3 + gap, y, w3, "Order date", orderD, h1, false);
  box(M + 2 * (w3 + gap), y, w3, "Delivery", deliv, h1, false);
  y += h1 + 3;

  // row 2: deliver to / site contact
  const w2 = (R - M - gap) / 2;
  const to = doc.splitTextToSize(po.delivery_address || "—", w2 - 6) as string[];
  const contact = doc.splitTextToSize([po.site_contact_name, po.site_contact_phone].filter(Boolean).join(" · ") || "—", w2 - 6) as string[];
  const h2 = Math.max(15, 9.6 + Math.max(to.length, contact.length) * 4.6 + 2.5);
  box(M, y, w2, "Deliver to", to, h2, true);
  box(M + w2 + gap, y, w2, "Site contact", contact, h2, true);
  y += h2 + 6;

  // items table
  const col = { code: M + 3, item: M + 27, pks: R - 58, unit: R - 32, total: R - 3 };
  const tableHead = () => {
    doc.setFillColor(...GREY_BG);
    doc.roundedRect(M, y, R - M, 7, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...LABEL);
    doc.text("CODE", col.code, y + 4.6);
    doc.text("ITEM", col.item, y + 4.6);
    doc.text("PKS", col.pks, y + 4.6, { align: "right" });
    doc.text("UNIT COST", col.unit, y + 4.6, { align: "right" });
    doc.text("TOTAL", col.total, y + 4.6, { align: "right" });
    y += 7;
  };
  tableHead();
  doc.setFontSize(9);
  if (lines.length === 0) {
    doc.setTextColor(156, 163, 175);
    doc.text("No line items.", W / 2, y + 8, { align: "center" });
    y += 14;
  }
  for (const l of lines) {
    const name = doc.splitTextToSize(l.parts?.name || "—", col.pks - 14 - col.item) as string[];
    const rowH = name.length * 4.4 + 3.6;
    if (y + rowH > 268) {
      doc.addPage();
      y = M;
      tableHead();
    }
    const lineTotal = (Number(l.qty_pks) || 0) * (Number(l.unit_cost) || 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(l.parts?.code || "—", col.code, y + 5);
    doc.setTextColor(0);
    doc.text(name, col.item, y + 5);
    doc.text(String(l.qty_pks), col.pks, y + 5, { align: "right" });
    doc.text(money(Number(l.unit_cost) || 0), col.unit, y + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(money(lineTotal), col.total, y + 5, { align: "right" });
    y += rowH;
    doc.setDrawColor(243, 244, 246);
    doc.line(M, y, R, y);
  }
  y += 4;

  if (po.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const nl = doc.splitTextToSize(po.notes, R - M - 8) as string[];
    const nh = nl.length * 4.4 + 6;
    if (y + nh > 268) {
      doc.addPage();
      y = M;
    }
    doc.setFillColor(...GREY_BG);
    doc.roundedRect(M, y, R - M, nh, 2, 2, "F");
    doc.setTextColor(0);
    doc.text(nl, M + 4, y + 6);
    y += nh + 4;
  }

  // totals
  const t = poTotals(input);
  const rows: [string, string, boolean][] = [["Subtotal (ex GST)", money(t.subtotal), false]];
  if (t.fuel > 0) {
    rows.push([`Fuel levy${po.fuel_levy_type === "percent" ? ` (${Number(po.fuel_levy_value)}%)` : ""} (ex GST)`, money(t.fuel), false]);
  }
  rows.push(["GST (10%)", money(t.gst), false]);
  const th = rows.length * 5.6 + 12;
  if (y + th + 16 > 285) {
    doc.addPage();
    y = M;
  }
  const bw = 72;
  doc.setFillColor(...GREY_BG);
  doc.roundedRect(R - bw, y, bw, th, 2, 2, "F");
  let ty = y + 6.5;
  doc.setFontSize(8.5);
  for (const [k, v] of rows) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...LABEL);
    doc.text(k, R - bw + 3.5, ty);
    doc.setTextColor(0);
    doc.text(v, R - 3.5, ty, { align: "right" });
    ty += 5.6;
  }
  doc.setDrawColor(229, 231, 235);
  doc.line(R - bw + 3.5, ty - 2.6, R - 3.5, ty - 2.6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0);
  doc.text("Total (inc GST)", R - bw + 3.5, ty + 2.2);
  doc.text(money(t.total), R - 3.5, ty + 2.2, { align: "right" });
  y += th + 10;

  // footer
  doc.setDrawColor(243, 244, 246);
  doc.line(M, y, R, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text("Better Batt Insulation", M, y + 5);
  doc.text("Received by: ______________________", R, y + 5, { align: "right" });

  return new Uint8Array(doc.output("arraybuffer"));
}
