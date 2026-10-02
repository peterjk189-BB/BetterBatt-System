import { createClient } from "@/lib/supabase/server";
import CalendarView from "./CalendarView";

export default async function CalendarPage() {
  const supabase = await createClient();
  const [{ data: woLines }, { data: pos }] = await Promise.all([
    supabase
      .from("work_order_lines")
      .select(
        "id, task_date, note, qty, work_order_id, subcontractor_id, work_orders(wo_number, archived, contractor_id, projects(quote_number, address, suburb, customers(name)), subcontractors(name)), subcontractors(name), labour_items(code, description)"
      )
      .not("task_date", "is", null)
      .order("task_date"),
    supabase
      .from("purchase_orders")
      .select("id, po_number, status, delivery_date, delivery_address, archived, suppliers(name)")
      .not("delivery_date", "is", null)
      .order("delivery_date"),
  ]);

  return <CalendarView woLines={(woLines ?? []) as any} pos={(pos ?? []) as any} />;
}
