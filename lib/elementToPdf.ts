/**
 * Turns a printable page element into a small A4 PDF.
 * The page is captured once, then cut into one image per page and stored as JPEG
 * (a typical quote comes out around 100-300 KB instead of many MB).
 */
export async function elementToPdf(
  el: HTMLElement,
  filename: string,
  orientation: "portrait" | "landscape" = "portrait"
) {
  const [html2canvasMod, jsPdfMod] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const html2canvas: any = (html2canvasMod as any).default || html2canvasMod;
  const jsPDF: any = (jsPdfMod as any).jsPDF || (jsPdfMod as any).default;

  // About 195 dpi on A4: sharp text, far smaller than a 2x retina capture.
  const targetWidthPx = orientation === "portrait" ? 1625 : 2300;
  // Always lay the page out at desktop width, so a phone gets the same PDF as a computer.
  const layoutWidth = orientation === "portrait" ? 800 : 1100;
  const baseWidth = Math.max(el.offsetWidth, layoutWidth);
  const baseHeight = el.offsetHeight * (baseWidth / Math.max(1, el.offsetWidth)); // rough: narrower layouts are taller
  let scale = Math.min(3, Math.max(1, targetWidthPx / baseWidth));
  // Phones (iOS Safari especially) refuse canvases above roughly 16 million pixels, so long pages get a lower scale.
  const maxPixels = 14_000_000;
  const pixels = baseWidth * baseHeight * scale * scale;
  if (pixels > maxPixels) scale = Math.max(0.6, Math.sqrt(maxPixels / Math.max(1, baseWidth * baseHeight)));
  // useCORS lets photos stored in Supabase draw onto the canvas.
  const canvas: HTMLCanvasElement = await html2canvas(el, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    // Desktop-sized layout whatever the screen: media queries see a wide window and the page is held at full width.
    windowWidth: 1280,
    width: baseWidth,
    onclone: (doc: Document, clone: HTMLElement) => {
      clone.style.width = `${baseWidth}px`;
      clone.style.maxWidth = "none";
      clone.style.margin = "0";
    },
  });

  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const pagePx = Math.floor((canvas.width * pageH) / pageW); // canvas pixels that fill one page

  let y = 0;
  let first = true;
  while (y < canvas.height) {
    const sliceH = Math.min(pagePx, canvas.height - y);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.72), "JPEG", 0, 0, pageW, (sliceH * pageW) / canvas.width, undefined, "FAST");
    first = false;
    y += sliceH;
  }
  pdf.save(filename);
}

/** "Quote Q1006 - Customer - 22 Jenny Court, Boronia.pdf" — drops characters files can't contain. */
export function pdfFileName(...parts: (string | null | undefined)[]) {
  const name = parts
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join(" - ")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return `${name || "Document"}.pdf`;
}
