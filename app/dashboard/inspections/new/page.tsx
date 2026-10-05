import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import { emptySection, reinspectionSection, sectionsFromSwms, type InspectionPrefill, type SectionKey } from "@/lib/inspections";
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
    const [{ data: wo }, { data: swmsList }] = await Promise.all([
      supabase
        .from("work_orders")
        .select("id, wo_number, po_number, project_id, projects(address, suburb, customers(name)), subcontractors(name, company_name)")
        .eq("id", searchParams.work_order_id)
        .single(),
      supabase
        .from("swms")
        .select("swms_number, job_type, scope, status, installers")
        .eq("work_order_id", searchParams.work_order_id)
        .eq("archived", false)
        .order("swms_number", { ascending: false }),
    ]);
    if (wo) {
      const project = (wo as any).projects;
      const sub = (wo as any).subcontractors;
      const swms = (swmsList ?? []).find((s) => s.status === "Completed") || (swmsList ?? [])[0];
      const fromSwms = swms ? sectionsFromSwms(swms.job_type, swms.scope) : null;
      const sections: Partial<Record<SectionKey, ReturnType<typeof emptySection>>> = {};
      if (fromSwms) {
        for (const k of ["foil", "wall", "ceiling"] as SectionKey[]) sections[k] = { ...emptySection(), options: fromSwms.options[k] };
      }
      const installerFromSwms = Array.isArray(swms?.installers)
        ? (swms!.installers as { name?: string }[]).map((i) => i?.name).filter(Boolean).join(", ")
        : "";
      const prefill: InspectionPrefill = {
        work_order_id: wo.id,
        project_id: wo.project_id || undefined,
        site_address: project?.address || "",
        suburb: project?.suburb || "",
        builder_name: project?.customers?.name || "",
        contractor: sub?.company_name || sub?.name || "",
        installer_name: installerFromSwms || sub?.name || "",
        sales_order: wo.po_number || wo.wo_number || "",
        ...(fromSwms ? fromSwms.include : {}),
        sections,
        source: swms
          ? `Filled in from work order ${wo.wo_number} and SWMS${swms.swms_number} (${swms.job_type}). Check the ticked inspections suit the job.`
          : `Filled in from work order ${wo.wo_number}. No SWMS yet, so tick the inspections this report covers.`,
      };
      return <InspectionEditor record={null} photos={[]} prefill={prefill} isAdmin={role === "admin"} />;
    }
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
