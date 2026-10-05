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

/**
 * Catch-up booking: any work order whose SWMS is Completed but has no
 * inspection yet gets a 'Scheduled' inspection for the next weekday. Covers
 * SWMS completed before auto-booking existed, or when a booking failed at
 * the time. Run with the service-role client from staff-only pages.
 * Returns the work orders booked, and any that couldn't be (with the reason).
 */
export async function bookDueInspections(admin: any): Promise<{ booked: string[]; errors: string[] }> {
  const booked: string[] = [];
  const errors: string[] = [];

  const [{ data: swms }, { data: existing }] = await Promise.all([
    admin.from("swms").select("id, work_order_id").eq("status", "Completed").eq("archived", false).not("work_order_id", "is", null),
    admin.from("inspections").select("work_order_id").eq("archived", false).not("work_order_id", "is", null),
  ]);
  const have = new Set(((existing ?? []) as any[]).map((i) => i.work_order_id));
  const woIds = Array.from(new Set(((swms ?? []) as any[]).map((s) => s.work_order_id as string))).filter((id) => !have.has(id));
  if (woIds.length === 0) return { booked, errors };

  const { data: wos } = await admin.from("work_orders").select("id, wo_number, archived").in("id", woIds);
  const date = nextInspectionDate();

  for (const wo of ((wos ?? []) as any[]).filter((w) => !w.archived)) {
    const prefill = await prefillFromWorkOrder(admin, wo.id);
    if (!prefill) continue;
    const { data: inserted, error } = await admin
      .from("inspections")
      .insert({ ...prefillToRow(prefill), status: "Scheduled", inspection_date: date })
      .select("id, inspection_number")
      .single();
    if (error || !inserted) {
      errors.push(`${wo.wo_number}: ${error?.message || "could not book"}`);
      continue;
    }
    booked.push(wo.wo_number);
    await admin
      .from("swms")
      .update({ inspection_notified_at: new Date().toISOString() })
      .eq("work_order_id", wo.id)
      .eq("status", "Completed")
      .is("inspection_notified_at", null);
    await admin.from("audit_log").insert({
      user_id: null,
      user_name: "Auto-booked (SWMS completed)",
      event_type: "create",
      entity_type: "Inspection",
      entity_id: inserted.id,
      entity_label: `INS${inserted.inspection_number}${prefill.site_address ? " — " + prefill.site_address : ""}`,
      details: `Booked for ${date} — work order ${wo.wo_number} had a completed SWMS but no inspection`,
    });
  }
  return { booked, errors };
}
