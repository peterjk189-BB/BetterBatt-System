import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { loadStatement } from "@/lib/statementServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") || new Date().toISOString().slice(0, 10);
  const out = await loadStatement(ctx.supabase, sp.get("customer_id") || "", date);
  if (!out) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const safe = (out.customer.name || "customer").replace(/[^a-z0-9]+/gi, "-");
  return new NextResponse(Buffer.from(out.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Statement-${safe}-${date}.pdf"` },
  });
}
