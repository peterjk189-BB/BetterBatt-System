import { createClient } from "@/lib/supabase/server";
import WorkOrdersList from "./WorkOrdersList";

export default async function WorkOrdersPage() {
  const supabase = await createClient();
  const [{ data: workOrders }, { data: lines }, { data: labourItems }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, wo_number, project_id, contractor_id, po_number, po_value, jsa_received, archived, projects(quote_number, address, suburb, customers(name)), subcontractors(name)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("work_order_lines").select("work_order_id, labour_item_id, qty"),
    supabase.from("labour_items").select("id, contractor_rate"),
  ]);

  return (
    <WorkOrdersList
      initial={(workOrders ?? []) as any}
      lines={lines ?? []}
      labourItems={labourItems ?? []}
    />
  );
}
