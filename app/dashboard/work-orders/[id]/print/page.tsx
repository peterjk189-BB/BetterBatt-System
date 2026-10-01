import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkOrderPrintView from "./WorkOrderPrintView";

export default async function WorkOrderPrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: workOrder }, { data: lines }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, wo_number, po_number, po_value, entry_date, completed_date, jsa_received, notes, projects(quote_number, address, suburb, customers(name)), subcontractors(name, phone, email)"
      )
      .eq("id", params.id)
      .single(),
    supabase
      .from("work_order_lines")
      .select("task_date, qty, note, parts(name), labour_items(code, description, contractor_rate), subcontractors(name)")
      .eq("work_order_id", params.id)
      .order("sort_order"),
  ]);

  if (!workOrder) notFound();

  return <WorkOrderPrintView workOrder={workOrder as any} lines={(lines ?? []) as any} />;
}
