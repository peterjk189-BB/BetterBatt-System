import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PickingSlipPrintView from "./PickingSlipPrintView";

export default async function PickingSlipPrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const [{ data: workOrder }, { data: lines }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_number, stock_delivery_date, projects(quote_number, lot_no, address, suburb, customers(name))")
      .eq("id", params.id)
      .single(),
    supabase
      .from("work_order_lines")
      .select(
        "id, qty, note, part_id, picked, multi_picked, packs_picked, parts(name, code, coverage_m2, pack_per_multi, stock_on_hand, is_stock_item)"
      )
      .eq("work_order_id", params.id)
      .order("sort_order"),
  ]);

  if (!workOrder) notFound();

  const materialLines = (lines ?? []).filter((l: any) => l.part_id && l.parts?.is_stock_item !== false);
  const project = (workOrder as any).projects;

  return (
    <PickingSlipPrintView
      workOrder={{
        id: workOrder.id,
        wo_number: (workOrder as any).wo_number,
        address: project ? [(project.lot_no ? (/^lot\b/i.test(project.lot_no.trim()) ? project.lot_no.trim() : `Lot ${project.lot_no.trim()}`) : null), project.address, project.suburb].filter(Boolean).join(", ") : null,
        customerName: project?.customers?.name ?? null,
        quoteNumber: project?.quote_number ?? null,
        deliveryDate: (workOrder as any).stock_delivery_date ?? null,
      }}
      lines={materialLines as any}
    />
  );
}
