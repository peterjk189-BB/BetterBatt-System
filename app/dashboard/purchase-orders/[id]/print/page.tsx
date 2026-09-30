import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PurchaseOrderPrintView from "./PurchaseOrderPrintView";

export default async function PurchaseOrderPrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: purchaseOrder }, { data: lines }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, po_number, status, order_date, delivery_address, site_contact_name, site_contact_phone, delivery_date, delivery_time, notes, suppliers(name)"
      )
      .eq("id", params.id)
      .single(),
    supabase
      .from("purchase_order_lines")
      .select("qty_pks, unit_cost, parts(name)")
      .eq("purchase_order_id", params.id),
  ]);

  if (!purchaseOrder) notFound();

  return <PurchaseOrderPrintView purchaseOrder={purchaseOrder as any} lines={(lines ?? []) as any} />;
}
