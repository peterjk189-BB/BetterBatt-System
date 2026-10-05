import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import { emptySection, reinspectionSection, type InspectionPrefill, type SectionKey } from "@/lib/inspections";
import { prefillFromWorkOrder } from "@/lib/inspectionPrefill";
import InspectionEditor from "../InspectionEditor";
import WorkOrderPicker from "./WorkOrderPicker";

// A new inspection always belongs to a work order. It opens one of three ways:
//   ?reinspect=<inspection id>  follow-up of a FAILed inspection
//   ?work_order_id=<id>         filled in from the work order and its SWMS
//   (neither)                   pick the work order first
export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: { work_order_id?: string; reinspect?: string };
}) {
  const supabase = await createClient();
  const role = await getEffectiveRole();

  if (searchParams.reinspect) {
    const { data: parent } = await supabase.from("inspections").select("*").eq("id", searchParams.reinspect).single();
    if (parent) {
      const sections: Partial<Record<SectionKey, ReturnType<typeof emptySection>>> = {
        foil: reinspectionSection(parent.foil),
        wall: reinspectionSection(parent.wall),
        ceiling: reinspectionSection(parent.ceiling),
      };
      const prefill: InspectionPrefill = {
        work_order_id: parent.work_order_id || undefined,
        project_id: parent.project_id || undefined,
        site_address: parent.site_address || "",
        suburb: parent.suburb || "",
        builder_name: parent.builder_name || "",
        contractor: parent.contractor || "",
        installer_name: parent.installer_name || "",
        sales_order: parent.sales_order || "",
        audit_region: parent.audit_region || "",
        include_foil: parent.include_foil,
        include_wall: parent.include_wall,
        include_ceiling: parent.include_ceiling,
        sections,
        parent_inspection_id: parent.id,
        parent_number: parent.inspection_number,
        source: `Re-inspection of INS${parent.inspection_number}. Lines that failed are flagged — re-check those.`,
      };
      return <InspectionEditor record={null} photos={[]} prefill={prefill} isAdmin={role === "admin"} />;
    }
  }

  if (searchParams.work_order_id) {
    const prefill = await prefillFromWorkOrder(supabase, searchParams.work_order_id);
    if (prefill) return <InspectionEditor record={null} photos={[]} prefill={prefill} isAdmin={role === "admin"} />;
  }

  const [{ data: workOrders }, { data: swms }, { data: inspections }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_number, po_number, projects(address, suburb, customers(name)), subcontractors(name)")
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    supabase.from("swms").select("id, status, archived, work_order_id").not("work_order_id", "is", null),
    supabase
      .from("inspections")
      .select("id, inspection_number, status, result, parent_inspection_id, archived, work_order_id")
      .not("work_order_id", "is", null),
  ]);

  return <WorkOrderPicker workOrders={(workOrders ?? []) as any} swms={(swms ?? []) as any} inspections={(inspections ?? []) as any} />;
}
