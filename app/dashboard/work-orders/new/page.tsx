import { createClient } from "@/lib/supabase/server";
import WorkOrderEditor from "../WorkOrderEditor";

const isDeliveryItem = (name: string | undefined) => /delivery/i.test(name || "");

function computeQuoteTotal(
  project: { job_type: string; quote_markup: number },
  lines: { part_id: string | null; qty_m2: number }[],
  partById: Record<string, { coverage_m2: number; supply_charge_per_pack: number; supply_install_rate_per_m2: number }>
) {
  const isSupplyOnly = project.job_type === "SUPPLY ONLY";
  let chargeBeforeMarkup = 0;
  for (const l of lines) {
    const part = l.part_id ? partById[l.part_id] : undefined;
    if (!part) continue;
    const packs = part.coverage_m2 > 0 ? Math.ceil(l.qty_m2 / part.coverage_m2) : 0;
    const usedForCal = packs * part.coverage_m2;
    chargeBeforeMarkup += isSupplyOnly ? packs * part.supply_charge_per_pack : usedForCal * part.supply_install_rate_per_m2;
  }
  const subtotal = chargeBeforeMarkup + Number(project.quote_markup || 0);
  return subtotal + subtotal * 0.1;
}

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: { project_id?: string };
}) {
  const supabase = await createClient();
  const [{ data: projects }, { data: subs }, { data: labourItems }, { data: parts }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, quote_number, address, suburb, job_type, quote_markup, customers(name)")
      .eq("archived", false)
      .order("quote_number", { ascending: false }),
    supabase.from("subcontractors").select("id, name, phone, email").eq("archived", false).order("name"),
    supabase.from("labour_items").select("*").eq("archived", false).order("code"),
    supabase.from("parts").select("id, name, coverage_m2, supply_charge_per_pack, supply_install_rate_per_m2"),
  ]);

  let prefill = null;
  if (searchParams.project_id) {
    const [{ data: project }, { data: lines }] = await Promise.all([
      supabase
        .from("projects")
        .select("id, quote_number, job_type, quote_markup")
        .eq("id", searchParams.project_id)
        .single(),
      supabase.from("project_lines").select("part_id, qty_m2, note").eq("project_id", searchParams.project_id),
    ]);

    if (project) {
      const partById = Object.fromEntries((parts ?? []).map((p) => [p.id, p]));
      const total = computeQuoteTotal(project, lines ?? [], partById as any);
      const nonDeliveryLines = (lines ?? []).filter((l) => !isDeliveryItem(partById[l.part_id || ""]?.name));
      prefill = {
        project_id: project.id,
        wo_number: `QW${project.quote_number}`,
        po_value: Math.round(total * 100) / 100,
        lines: nonDeliveryLines.map((l) => ({
          part_id: l.part_id,
          qty: l.qty_m2,
          note: l.note,
        })),
      };
    }
  }

  return (
    <WorkOrderEditor
      workOrder={null}
      lines={prefill?.lines ?? []}
      prefillHeader={prefill ? { project_id: prefill.project_id, wo_number: prefill.wo_number, po_value: prefill.po_value } : null}
      projects={(projects ?? []) as any}
      subs={subs ?? []}
      labourItems={labourItems ?? []}
      parts={parts ?? []}
    />
  );
}
