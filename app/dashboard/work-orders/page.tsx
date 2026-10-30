import { createClient } from "@/lib/supabase/server";
import WorkOrdersList from "./WorkOrdersList";
import { getEffectiveRole } from "@/lib/currentUser";
import { getInstallerScope } from "@/lib/installerScope";

export default async function WorkOrdersPage() {
  const supabase = await createClient();
  const role = await getEffectiveRole();
  const isStaff = role === "admin" || role === "office";
  const scope = await getInstallerScope(supabase);
  const [{ data: workOrders }, { data: lines }, { data: labourItems }, { data: swms }, { data: inspections }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, wo_number, project_id, contractor_id, po_number, po_value, jsa_received, authorised_at, archived, projects(quote_number, address, suburb, customers(name)), subcontractors(name)"
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

  // Contractors (and "Preview as" a contractor) only ever see their own authorised, non-archived jobs.
  const wos = ((workOrders ?? []) as any[]).filter((w) => !scope || scope.woIds.includes(w.id));
  const woSet = new Set(wos.map((w) => w.id));
  const myLines = scope ? ((lines ?? []) as any[]).filter((l) => woSet.has(l.work_order_id)) : lines ?? [];
  const mySwms = scope ? ((swms ?? []) as any[]).filter((x) => woSet.has(x.work_order_id)) : swms ?? [];
  const myIns = scope ? ((inspections ?? []) as any[]).filter((x) => woSet.has(x.work_order_id)) : inspections ?? [];

  return (
    <WorkOrdersList
      initial={wos.map((w) => (isStaff ? w : { ...w, po_value: null, po_number: null }))}
      lines={myLines as any}
      labourItems={labourItems ?? []}
      swms={mySwms as any}
      inspections={myIns as any}
      isStaff={isStaff}
    />
  );
}
