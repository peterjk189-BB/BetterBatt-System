import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoicePickingSlip from "./InvoicePickingSlip";

export default async function InvoicePickingSlipPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: invoice }, linesRes] = await Promise.all([
    supabase.from("invoices").select("*, customers(name, contact_name, contact_phone, contact_email), projects(quote_number, lot_no, address, suburb, contact_name, contact_phone)").eq("id", params.id).single(),
    supabase
      .from("invoice_lines")
      .select("id, description, qty, part_id, fulfilment, picked, multi_picked, packs_picked, sort_order, parts(id, name, code, pack_per_multi, stock_on_hand, is_stock_item, pack_unit, multi_unit)")
      .eq("invoice_id", params.id)
      .order("sort_order"),
  ]);
  if (!invoice) notFound();
  // Unit names need migration 0076; until it is run, fall back to the plain columns.
  let lines: any[] | null = linesRes.data;
  if (linesRes.error) {
    const retry = await supabase
      .from("invoice_lines")
      .select("id, description, qty, part_id, fulfilment, picked, multi_picked, packs_picked, sort_order, parts(id, name, code, pack_per_multi, stock_on_hand, is_stock_item)")
      .eq("invoice_id", params.id)
      .order("sort_order");
    lines = retry.data;
  }
  // Spare packs put back (migration 0087) are fetched separately so this page still works before it's run.
  const { data: backRows } = await supabase.from("invoice_lines").select("id, packs_returned").eq("invoice_id", params.id);
  const backById: Record<string, number> = {};
  for (const r of (backRows ?? []) as any[]) backById[r.id] = Number(r.packs_returned) || 0;
  lines = (lines ?? []).map((l: any) => ({ ...l, packs_returned: backById[l.id] || 0 }));
  return <InvoicePickingSlip invoice={invoice as any} lines={((lines ?? []) as any[]).filter((l) => l.fulfilment !== "supplier" && l.part_id && l.parts?.is_stock_item !== false)} />;
}
