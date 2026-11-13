// Supplier pricing request PDF: current pack price vs the pack price we need. Deliberately leaves out our
// sell rates, installer costs and margins so it can be handed to a supplier.

export type SupplierPdfRow = {
  product: string;
  code: string;
  supplier: string;
  m2PerPack: number;
  packs: number;
  nowPack: number;
  targetPack: number;
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export async function downloadSupplierPricingPdf(rows: SupplierPdfRow[], asOf: string, supplierFilter: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const L = 14, R = 283, PH = 210;
  const list = rows.filter((r) => !supplierFilter || r.supplier === supplierFilter).sort((a, b) => a.supplier.localeCompare(b.supplier) || a.product.localeCompare(b.product));
  const cols = [
    { h: "Product", x: L, w: 92, a: "l" as const },
    { h: "m² / pack", x: 106, w: 20, a: "r" as const },
    { h: "Packs / yr*", x: 128, w: 22, a: "r" as const },
    { h: "Current price / pack", x: 152, w: 34, a: "r" as const },
    { h: "Target price / pack", x: 188, w: 34, a: "r" as const },
    { h: "Reduction", x: 224, w: 28, a: "r" as const },
    { h: "Reduction %", x: 254, w: 29, a: "r" as const },
  ];

  const header = (title: boolean) => {
    if (title) {
      doc.setFillColor(20, 20, 19);
      doc.roundedRect(L, 12, R - L, 24, 2.5, 2.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Better Batt Insulation", L + 6, 23);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Supplier pricing request${supplierFilter ? " – " + supplierFilter : ""}  ·  ${asOf}`, L + 6, 30);
    }
  };
  const tableHead = (y: number) => {
    doc.setFillColor(205, 201, 192);
    doc.rect(L, y, R - L, 8, "F");
    doc.setTextColor(20, 20, 19);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    for (const c of cols) doc.text(c.h, c.a === "l" ? c.x + 2 : c.x + c.w, y + 5.5, { align: c.a === "l" ? "left" : "right" });
  };

  header(true);
  doc.setTextColor(60, 60, 58);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Prices are per pack, ex GST. The target price is what we need to buy at to keep our volume work viable.", L, 44);

  let y = 50;
  tableHead(y);
  y += 8;
  let lastSup = "";
  let totalSave = 0;
  for (const r of list) {
    if (y > PH - 24) {
      doc.addPage();
      y = 14;
      tableHead(y);
      y += 8;
    }
    if (!supplierFilter && r.supplier !== lastSup) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(20, 20, 19);
      doc.text(r.supplier, L + 2, y + 5);
      y += 7;
      lastSup = r.supplier;
    }
    const cut = Math.max(0, r.nowPack - r.targetPack);
    totalSave += cut * r.packs;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 19);
    doc.text(`${r.code ? r.code + " · " : ""}${r.product}`.slice(0, 62), cols[0].x + 2, y + 5);
    const vals = [String(r.m2PerPack), r.packs ? r.packs.toLocaleString("en-AU") : "—", money(r.nowPack), money(r.targetPack), cut > 0.005 ? "−" + money(cut) : "No change", cut > 0.005 && r.nowPack > 0 ? ((cut / r.nowPack) * 100).toFixed(1) + "%" : "—"];
    vals.forEach((v, i) => {
      const c = cols[i + 1];
      if (i === 3) doc.setFont("helvetica", "bold");
      doc.text(v, c.x + c.w, y + 5, { align: "right" });
      doc.setFont("helvetica", "normal");
    });
    doc.setDrawColor(220, 218, 212);
    doc.line(L, y + 7.5, R, y + 7.5);
    y += 8;
  }
  if (y > PH - 22) { doc.addPage(); y = 16; }
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 19);
  doc.text(`Total saving requested on the packs shown: ${money(totalSave)}`, L, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 98);
  doc.text("* Packs / yr is the volume purchased across accepted and completed jobs to date. All prices ex GST.", L, y + 6);

  doc.save(`Supplier-pricing-request-${supplierFilter ? supplierFilter.replace(/[^a-z0-9]+/gi, "-") + "-" : ""}${asOf}.pdf`);
}
