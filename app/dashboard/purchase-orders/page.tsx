import { createClient } from "@/lib/supabase/server";
import PurchaseOrdersList from "./PurchaseOrdersList";

export default async function PurchaseOrdersPage() {
  const supabase = await createClient();
  const cols = "id, po_number, status, order_date, delivery_address, delivery_date, delivery_time, archived, suppliers(name)";
  // fuel levy columns exist only after migration 0058 — fall back without them.
  let posRes: any = await supabase.from("purchase_orders").select(cols + ", fuel_levy_type, fuel_levy_value").order("created_at", { ascending: false });
  if (posRes.error) posRes = await supabase.from("purchase_orders").select(cols).order("created_at", { ascending: false });
  const pos = posRes.data;
  const [{ data: lines }, { data: parts }] = await Promise.all([
    supabase.from("purchase_order_lines").select("purchase_order_id, part_id, qty_multi, qty_pks, unit_cost"),
    supabase.from("parts").select("id, pack_per_multi"),
  ]);

  return (
    <PurchaseOrdersList
      initial={(pos ?? []) as any}
      lines={lines ?? []}
      parts={parts ?? []}
    />
  );
}
