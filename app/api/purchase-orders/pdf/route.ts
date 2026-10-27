import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { loadPoPdf } from "@/lib/poServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const url = new URL(req.url);
  const out = await loadPoPdf(ctx.supabase, url.searchParams.get("id") || "");
  if (!out) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  const name = `Purchase Order ${out.po.po_number || ""}`.trim() + ".pdf";
  return new NextResponse(Buffer.from(out.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"`,
    },
  });
}
