import { createClient } from "@/lib/supabase/server";
import { jobProgress } from "@/lib/jobProgress";
import InspectionsList, { type DueJob } from "./InspectionsList";

export default async function InspectionsPage() {
  const supabase = await createClient();
  const [{ data: records }, { data: workOrders }, { data: swms }] = await Promise.all([
    supabase
      .from("inspections")
      .select(
        "id, inspection_number, inspection_date, status, result, builder_name, site_address, suburb, include_foil, include_wall, include_ceiling, archived, work_order_id, parent_inspection_id, work_orders(wo_number), projects(quote_number)"
      )
      .order("inspection_date", { ascending: false })
      .order("inspection_number", { ascending: false }),
    supabase
      .from("work_orders")
      .select("id, wo_number, projects(address, suburb, customers(name)), subcontractors(name)")
      .eq("archived", false),
    supabase
      .from("swms")
      .select("id, swms_number, status, archived, work_order_id, updated_at")
      .not("work_order_id", "is", null)
      .eq("archived", false),
  ]);

  // Jobs waiting on us: the installer's SWMS is in but there's no inspection
  // yet, or the latest inspection FAILed and needs a re-inspection.
  const due: DueJob[] = [];
  for (const w of (workOrders ?? []) as any[]) {
    const woSwms = (swms ?? []).filter((s) => s.work_order_id === w.id);
    const woIns = (records ?? []).filter((r) => r.work_order_id === w.id) as any[];
    const p = jobProgress(woSwms, woIns);
    if (p.stage !== "inspection-due" && p.stage !== "reinspection-due") continue;
    const completed = woSwms.filter((s) => s.status === "Completed").sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
    due.push({
      work_order_id: w.id,
      wo_number: w.wo_number,
      address: w.projects?.address || null,
      suburb: w.projects?.suburb || null,
      builder: w.projects?.customers?.name || null,
      installer: w.subcontractors?.name || null,
      stage: p.stage,
      since: p.stage === "reinspection-due" ? null : completed?.updated_at || null,
      failed_inspection: p.stage === "reinspection-due" && p.latest ? { id: p.latest.id, inspection_number: p.latest.inspection_number } : null,
    });
  }
  due.sort((a, b) => (a.since || "").localeCompare(b.since || ""));

  return <InspectionsList initial={(records ?? []) as any} due={due} />;
}
