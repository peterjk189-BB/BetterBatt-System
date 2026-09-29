import { createClient } from "@/lib/supabase/server";
import PurchaseOrdersList from "./PurchaseOrdersList";

export default async function PurchaseOrdersPage() {
  const supabase = await createClient();
  const [{ data: pos }, { data: lines }, { data: parts }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, po_number, status, order_date, archived, suppliers(name)")
      .order("created_at", { ascending: false }),
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
