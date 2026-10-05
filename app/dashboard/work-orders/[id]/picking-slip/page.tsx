import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { packsNeeded } from "@/lib/picking";
import PickingSlip from "./PickingSlip";

export default async function PickingSlipPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const [{ data: workOrder }, { data: lines }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_number, projects(quote_number, address, suburb, customers(name))")
      .eq("id", params.id)
      .single(),
    supabase
      .from("work_order_lines")
      .select(
        "id, qty, note, part_id, allocated, allocated_at, picked, picked_at, multi_picked, packs_picked, parts(id, name, code, coverage_m2, pack_cost_ex_gst, supplier_id, stock_on_hand, pack_per_multi, is_stock_item)"
      )
      .eq("work_order_id", params.id)
      .order("sort_order"),
  ]);

  if (!workOrder) notFound();

  const materialLines = (lines ?? []).filter((l: any) => l.part_id && l.parts?.is_stock_item !== false);
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

  const project = (workOrder as any).projects;

  return (
    <PickingSlip
      workOrder={{
        id: workOrder.id,
        wo_number: (workOrder as any).wo_number,
        address: project ? [project.address, project.suburb].filter(Boolean).join(", ") : null,
        customerName: project?.customers?.name ?? null,
        quoteNumber: project?.quote_number ?? null,
      }}
      lines={materialLines as any}
      reservedByPart={reservedByPart}
    />
  );
}
