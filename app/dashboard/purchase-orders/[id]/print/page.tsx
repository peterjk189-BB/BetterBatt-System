import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PurchaseOrderPrintView from "./PurchaseOrderPrintView";

export default async function PurchaseOrderPrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const baseCols = "id, po_number, status, order_date, delivery_address, site_contact_name, site_contact_phone, delivery_date, delivery_time, notes, suppliers(name)";
  // fuel levy columns exist only after migration 0058 — fall back without them.
  const withFuel = await supabase.from("purchase_orders").select(baseCols + ", fuel_levy_type, fuel_levy_value").eq("id", params.id).single();
  const purchaseOrder = withFuel.error ? (await supabase.from("purchase_orders").select(baseCols).eq("id", params.id).single()).data : withFuel.data;
  const [{ data: lines }] = await Promise.all([
    supabase
      .from("purchase_order_lines")
      .select("qty_pks, unit_cost, parts(code, name)")
      .eq("purchase_order_id", params.id),
  ]);

  if (!purchaseOrder) notFound();

  return <PurchaseOrderPrintView purchaseOrder={purchaseOrder as any} lines={(lines ?? []) as any} />;
}
