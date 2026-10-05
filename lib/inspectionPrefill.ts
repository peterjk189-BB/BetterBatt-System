// Builds a new inspection's starting values from its work order and the
// installer's SWMS. Used by the "New inspection" page and by the automatic
// scheduling that happens when a SWMS is completed. Works with either the
// signed-in Supabase client or the service-role admin client.

import { emptySection, normaliseSection, sectionsFromSwms, type InspectionPrefill, type SectionKey } from "@/lib/inspections";

export async function prefillFromWorkOrder(supabase: any, workOrderId: string): Promise<InspectionPrefill | null> {
  const [{ data: wo }, { data: swmsList }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_number, po_number, project_id, projects(address, suburb, customers(name)), subcontractors(name, company_name)")
      .eq("id", workOrderId)
      .single(),
    supabase
      .from("swms")
      .select("swms_number, job_type, scope, status, installers")
      .eq("work_order_id", workOrderId)
      .eq("archived", false)
      .order("swms_number", { ascending: false }),
  ]);
  if (!wo) return null;

  const project = wo.projects;
  const sub = wo.subcontractors;
  const list = (swmsList ?? []) as any[];
  const swms = list.find((s) => s.status === "Completed") || list[0];
  const fromSwms = swms ? sectionsFromSwms(swms.job_type, swms.scope) : null;
  const sections: Partial<Record<SectionKey, ReturnType<typeof emptySection>>> = {};
  if (fromSwms) {
    for (const k of ["foil", "wall", "ceiling"] as SectionKey[]) sections[k] = { ...emptySection(), options: fromSwms.options[k] };
  }
  const installerFromSwms = Array.isArray(swms?.installers)
    ? (swms.installers as { name?: string }[]).map((i) => i?.name).filter(Boolean).join(", ")
    : "";

  return {
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
}

/** The database row for a prefilled inspection (everything except status/date, which the caller sets). */
export function prefillToRow(p: InspectionPrefill) {
  return {
    work_order_id: p.work_order_id || null,
    project_id: p.project_id || null,
    site_address: p.site_address || null,
    suburb: p.suburb || null,
    builder_name: p.builder_name || null,
    contractor: p.contractor || null,
    installer_name: p.installer_name || null,
    sales_order: p.sales_order || null,
    audit_region: p.audit_region || null,
    include_foil: !!p.include_foil,
    include_wall: !!p.include_wall,
    include_ceiling: !!p.include_ceiling,
    foil: normaliseSection(p.sections?.foil),
    wall: normaliseSection(p.sections?.wall),
    ceiling: normaliseSection(p.sections?.ceiling),
    parent_inspection_id: p.parent_inspection_id || null,
  };
}

/** Tomorrow in Melbourne, rolled forward to Monday if it lands on a weekend. YYYY-MM-DD. */
export function nextInspectionDate(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
