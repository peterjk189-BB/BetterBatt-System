import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PurchaseOrderPrintView from "./PurchaseOrderPrintView";

export default async function PurchaseOrderPrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const baseCols = "id, po_number, status, order_date, delivery_address, site_contact_name, site_contact_phone, delivery_date, delivery_time, notes";
  // Fuel levy columns (migration 0058) and supplier address (0059) may not exist yet — try the fullest select first and fall back.
  let purchaseOrder: any = null;
  for (const cols of [
    baseCols + ", fuel_levy_type, fuel_levy_value, suppliers(name, address)",
    baseCols + ", suppliers(name, address)",
    baseCols + ", fuel_levy_type, fuel_levy_value, suppliers(name)",
    baseCols + ", suppliers(name)",
  ]) {
    const r = await supabase.from("purchase_orders").select(cols).eq("id", params.id).single();
    if (!r.error) {
      purchaseOrder = r.data;
      break;
    }
  }
  const [{ data: lines }] = await Promise.all([
    supabase
      .from("purchase_order_lines")
      .select("qty_pks, unit_cost, parts(code, name)")
      .eq("purchase_order_id", params.id),
  ]);

  if (!purchaseOrder) notFound();

  return <PurchaseOrderPrintView purchaseOrder={purchaseOrder as any} lines={(lines ?? []) as any} />;
}
