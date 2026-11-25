import { NextResponse } from "next/server";
import { requireStaff, loadInvoicePdf } from "@/lib/invoiceServer";
import { docNo } from "@/lib/invoices";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const out = await loadInvoicePdf(ctx.supabase, id);
  if (!out) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  return new NextResponse(Buffer.from(out.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${docNo(out.inv)}.pdf"`,
    },
  });
}
