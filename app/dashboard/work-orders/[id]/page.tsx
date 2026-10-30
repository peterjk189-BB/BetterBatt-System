import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole, getEffectiveSubcontractorId } from "@/lib/currentUser";
import ContractorWorkOrder from "../ContractorWorkOrder";
import WorkOrderEditor from "../WorkOrderEditor";

export default async function WorkOrderPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  // Contractors get a read-only view of the job plus a form to add extra items (the office approves them).
  if ((await getEffectiveRole()) === "installer") {
    const subId = await getEffectiveSubcontractorId();
    const [{ data: wo }, { data: cLines }, { data: cExtras }, { data: cSwms }, { data: cIns }] = await Promise.all([
      supabase.from("work_orders").select("id, wo_number, notes, projects(address, suburb)").eq("id", params.id).single(),
      (async () => {
        // "rate" only exists once migration 0045 is run: fall back to the product's rate without it.
        const sel = "id, qty, task_date, task_time, completed, note, subcontractor_id, parts(name, installer_rate_per_m2, coverage_m2, is_stock_item)";
        const r = await supabase.from("work_order_lines").select(sel + ", rate").eq("work_order_id", params.id).order("sort_order");
        if (!r.error) return r;
        return supabase.from("work_order_lines").select(sel).eq("work_order_id", params.id).order("sort_order");
      })(),
      supabase.from("work_order_extras").select("id, description, qty, note, work_date, status, decision_note").eq("work_order_id", params.id).order("created_at"),
      supabase.from("swms").select("id, swms_number, status, archived").eq("work_order_id", params.id),
      supabase
        .from("inspections")
        .select("id, inspection_number, status, result, parent_inspection_id, archived, inspection_date")
        .eq("work_order_id", params.id),
    ]);
    if (!wo) notFound();
    // Optional tax invoicing: only shown to contractors the office has switched it on for.
    let invoicing: { enabled: boolean; invoices: { id: string; invoice_number: string; status: string }[] } | undefined;
    if (subId) {
      const { data: s } = await supabase.from("subcontractors").select("invoicing_enabled").eq("id", subId).single();
      if ((s as any)?.invoicing_enabled) {
        const { data: inv } = await supabase.from("contractor_invoices").select("id, invoice_number, status").eq("work_order_id", params.id).eq("subcontractor_id", subId).order("seq");
        invoicing = { enabled: true, invoices: (inv ?? []) as any };
      }
    }
    const proj = (wo as any).projects;
    return (
      <ContractorWorkOrder
        workOrder={{ id: (wo as any).id, wo_number: (wo as any).wo_number, notes: (wo as any).notes }}
        site={[proj?.address, proj?.suburb].filter(Boolean).join(", ")}
        lines={((cLines ?? []) as any[]).filter((l) => !subId || !l.subcontractor_id || l.subcontractor_id === subId) as any}
        extras={(cExtras ?? []) as any}
        subcontractorId={subId}
        progress={{ swms: (cSwms ?? []) as any, inspections: (cIns ?? []) as any }}
        invoicing={invoicing}
      />
    );
  }

  const [
    { data: workOrder },
    { data: lines },
    { data: projects },
    { data: subs },
    { data: labourItems },
    { data: parts },
    { data: swms },
    { data: inspections },
    role,
  ] = await Promise.all([
    supabase.from("work_orders").select("*").eq("id", params.id).single(),
    supabase.from("work_order_lines").select("*").eq("work_order_id", params.id).order("sort_order"),
    supabase
      .from("projects")
      .select("id, quote_number, address, suburb, job_type, quote_markup, customers(name)")
      .eq("archived", false)
      .order("quote_number", { ascending: false }),
    supabase.from("subcontractors").select("id, name, phone, email").eq("archived", false).order("name"),
    supabase.from("labour_items").select("*").eq("archived", false).order("code"),
    supabase.from("parts").select("id, name, coverage_m2, is_stock_item, supply_charge_per_pack, supply_install_rate_per_m2, installer_rate_per_m2"),
    supabase.from("swms").select("id, swms_number, status, archived").eq("work_order_id", params.id),
    supabase
      .from("inspections")
      .select("id, inspection_number, status, result, parent_inspection_id, archived, inspection_date")
      .eq("work_order_id", params.id),
    getEffectiveRole(),
  ]);

  if (!workOrder) notFound();

  return (
    <WorkOrderEditor
      workOrder={workOrder}
      lines={lines ?? []}
      prefillHeader={null}
      projects={(projects ?? []) as any}
      subs={subs ?? []}
      labourItems={labourItems ?? []}
      parts={parts ?? []}
      isAdmin={role === "admin"}
      canInspect={role === "admin" || role === "office"}
      progress={{ swms: (swms ?? []) as any, inspections: (inspections ?? []) as any }}
    />
  );
}
