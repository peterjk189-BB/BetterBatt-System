import { createClient } from "@/lib/supabase/server";
import WorkOrdersList from "./WorkOrdersList";
import { getEffectiveRole } from "@/lib/currentUser";

export default async function WorkOrdersPage() {
  const supabase = await createClient();
  const role = await getEffectiveRole();
  const isStaff = role === "admin" || role === "office";
  const [{ data: workOrders }, { data: lines }, { data: labourItems }, { data: swms }, { data: inspections }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, wo_number, project_id, contractor_id, po_number, po_value, jsa_received, archived, projects(quote_number, address, suburb, customers(name)), subcontractors(name)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("work_order_lines").select("*, parts(installer_rate_per_m2)"),
    supabase.from("labour_items").select("id, contractor_rate"),
    supabase.from("swms").select("id, status, archived, work_order_id").not("work_order_id", "is", null),
    supabase
      .from("inspections")
      .select("id, inspection_number, status, result, parent_inspection_id, archived, work_order_id")
      .not("work_order_id", "is", null),
  ]);

  return (
    <WorkOrdersList
      initial={((workOrders ?? []) as any[]).map((w) => (isStaff ? w : { ...w, po_value: null, po_number: null }))}
      lines={lines ?? []}
      labourItems={labourItems ?? []}
      swms={(swms ?? []) as any}
      inspections={(inspections ?? []) as any}
      isStaff={isStaff}
    />
  );
}
