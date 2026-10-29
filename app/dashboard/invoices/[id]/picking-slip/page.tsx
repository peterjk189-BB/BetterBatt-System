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
  return <InvoicePickingSlip invoice={invoice as any} lines={((lines ?? []) as any[]).filter((l) => l.fulfilment !== "supplier" && l.part_id && l.parts?.is_stock_item !== false)} />;
}
