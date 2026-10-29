import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { packsNeeded } from "@/lib/picking";
import PickingSlip from "./PickingSlip";

export default async function PickingSlipPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const [{ data: workOrder }, linesRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_number, stock_delivery_date, projects(quote_number, lot_no, address, suburb, customers(name))")
      .eq("id", params.id)
      .single(),
    supabase
      .from("work_order_lines")
      .select(
        "id, qty, note, part_id, allocated, allocated_at, picked, picked_at, multi_picked, packs_picked, parts(id, name, code, coverage_m2, pack_cost_ex_gst, supplier_id, stock_on_hand, pack_per_multi, is_stock_item, pack_unit, multi_unit)"
      )
      .eq("work_order_id", params.id)
      .order("sort_order"),
  ]);

  if (!workOrder) notFound();
  // Unit names need migration 0076; until it is run, fall back to the plain columns.
  let lines = linesRes.data;
  if (linesRes.error) {
    const retry = await supabase
      .from("work_order_lines")
      .select("id, qty, note, part_id, allocated, allocated_at, picked, picked_at, multi_picked, packs_picked, parts(id, name, code, coverage_m2, pack_cost_ex_gst, supplier_id, stock_on_hand, pack_per_multi, is_stock_item)")
      .eq("work_order_id", params.id)
      .order("sort_order");
    lines = retry.data;
  }

  // Returned-stock columns come from migration 0041; fetched separately so this page still works before it's run.
  const { data: returns } = await supabase
    .from("work_order_lines")
    .select("id, multi_returned, packs_returned, returned_at")
    .eq("work_order_id", params.id);
  const returnById: Record<string, any> = {};
  for (const r of (returns ?? []) as any[]) returnById[r.id] = r;
  const materialLines = (lines ?? [])
    .filter((l: any) => l.part_id && l.parts?.is_stock_item !== false)
    .map((l: any) => ({
      ...l,
      multi_returned: Number(returnById[l.id]?.multi_returned) || 0,
      packs_returned: Number(returnById[l.id]?.packs_returned) || 0,
      returned_at: returnById[l.id]?.returned_at ?? null,
    }));
  const partIds = Array.from(new Set(materialLines.map((l: any) => l.part_id as string)));

  // What's reserved by OTHER jobs' picking slips, per part — so "available"
  // here reflects the whole business, not just this one work order.
  const { data: elsewhere } =
    partIds.length > 0
      ? await supabase
          .from("work_order_lines")
          .select("part_id, qty, parts(coverage_m2), work_orders!inner(archived)")
          .in("part_id", partIds)
          .eq("allocated", true)
          .eq("picked", false)
          .neq("work_order_id", params.id)
          .eq("work_orders.archived", false)
      : { data: [] as any[] };

  const reservedByPart: Record<string, number> = {};
  for (const row of (elsewhere ?? []) as any[]) {
    const coverage = row.parts?.coverage_m2 || 0;
    reservedByPart[row.part_id] = (reservedByPart[row.part_id] || 0) + packsNeeded(Number(row.qty) || 0, coverage);
  }

  // Shortfalls already sitting on a draft purchase order for this job.
  const onDraft: Record<string, { poId: string; poNumber: string; qty: number }> = {};
  {
    const { data: poLines } = await supabase
      .from("purchase_order_lines")
      .select("part_id, qty_pks, purchase_order_id, purchase_orders!inner(id, po_number, status, archived)")
      .eq("work_order_id", params.id);
    for (const r of (poLines ?? []) as any[]) {
      const po = Array.isArray(r.purchase_orders) ? r.purchase_orders[0] : r.purchase_orders;
      if (!po || po.status !== "Draft" || po.archived || !r.part_id) continue;
      onDraft[r.part_id] = { poId: po.id, poNumber: po.po_number || "PO", qty: Number(r.qty_pks) || 0 };
    }
  }

  // Supplier-delivery flag comes from migration 0071; read separately so this page works before it's run.
  const { data: sd } = await supabase.from("work_orders").select("supplier_delivery").eq("id", params.id).single();
  const supplierDelivery = !!(sd as any)?.supplier_delivery;
  // "Materials delivered" comes from migration 0073 (set when a site-delivery PO is ticked delivered).
  const { data: md } = await supabase.from("work_orders").select("materials_delivered_at").eq("id", params.id).single();
  const project = (workOrder as any).projects;

  return (
    <PickingSlip
      workOrder={{
        id: workOrder.id,
        wo_number: (workOrder as any).wo_number,
        address: project ? [(project.lot_no ? (/^lot\b/i.test(project.lot_no.trim()) ? project.lot_no.trim() : `Lot ${project.lot_no.trim()}`) : null), project.address, project.suburb].filter(Boolean).join(", ") : null,
        customerName: project?.customers?.name ?? null,
        quoteNumber: project?.quote_number ?? null,
        deliveryDate: (workOrder as any).stock_delivery_date ?? null,
        supplierDelivery,
        materialsDeliveredAt: (md as any)?.materials_delivered_at ?? null,
      }}
      lines={materialLines as any}
      reservedByPart={reservedByPart}
      onDraft={onDraft}
    />
  );
}
