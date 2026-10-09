// Builds the signed working-agreement PDF (server side, jsPDF).
import { parseAgreement } from "@/lib/subAgreement";
import { LOGO_PNG_DATA_URL } from "@/lib/logoData";

export type AgreementPdfInput = {
  agreementText: string;
  companyName: string;
  tradingName?: string | null;
  abn: string;
  signedName: string;
  signedAt: Date;
  signedIp: string | null;
  signaturePng: string | null; // data URL
};

export async function buildAgreementPdf(input: AgreementPdfInput): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  const maxW = W - M * 2;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > 287) {
      doc.addPage();
      y = M;
    }
  };

  try {
    doc.addImage(LOGO_PNG_DATA_URL, "PNG", M, y - 6, 40, 20);
    y += 17;
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Better Batt Insulation", M, y);
    y += 7;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("Signed subcontractor working agreement", M, y);
  doc.setTextColor(0);
  y += 8;

  // Parties box
  doc.setFontSize(10);
  const party = [
    `Subcontractor: ${input.companyName}${input.tradingName ? ` (trading as ${input.tradingName})` : ""}`,
    `ABN: ${input.abn}`,
    `Signed by: ${input.signedName}`,
    `Date signed: ${input.signedAt.toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}`,
  ];
  for (const line of party) {
    doc.text(line, M, y);
    y += 5;
  }
  y += 4;

  for (const block of parseAgreement(input.agreementText)) {
    if (block.type === "heading") {
      ensure(12);
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(block.text, maxW) as string[];
      doc.text(lines, M, y);
      y += lines.length * 5 + 1;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const lines = doc.splitTextToSize(block.text, maxW) as string[];
      for (const ln of lines) {
        ensure(5);
        doc.text(ln, M, y);
        y += 4.6;
      }
      y += 2;
    }
  }

  ensure(60);
  y += 6;
  doc.setDrawColor(200);
  doc.line(M, y, W - M, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Signature", M, y);
  y += 4;
  if (input.signaturePng) {
    try {
      doc.addImage(input.signaturePng, "PNG", M, y, 70, 28);
    } catch {
      /* signature image unreadable - typed name below still records consent */
    }
  }
  y += 32;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`${input.signedName} - signed electronically on ${input.signedAt.toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne" })}`, M, y);
  y += 5;
  doc.setTextColor(110);
  doc.setFontSize(8);
  doc.text(
    `Electronic signature record. IP address: ${input.signedIp || "not recorded"}. Time (UTC): ${input.signedAt.toISOString()}`,
    M,
    y
  );

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}
