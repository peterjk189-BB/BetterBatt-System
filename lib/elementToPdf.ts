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

  // About 155 dpi on A4: sharp text, far smaller than a 2x retina capture.
  const targetWidthPx = orientation === "portrait" ? 1300 : 1840;
  const scale = Math.min(2, Math.max(1, targetWidthPx / Math.max(1, el.offsetWidth)));
  const canvas: HTMLCanvasElement = await html2canvas(el, { scale, backgroundColor: "#ffffff" });

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
