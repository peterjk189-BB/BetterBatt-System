import { createClient } from "@/lib/supabase/server";
import ContractorPaymentsTable from "./ContractorPaymentsTable";

export default async function ContractorPaymentsPage() {
  const supabase = await createClient();
  const [{ data: subs }, { data: lines }] = await Promise.all([
    supabase
      .from("subcontractors")
      .select("id, name, phone, email")
      .eq("archived", false)
      .order("name"),
    supabase
      .from("work_order_lines")
      .select(
        "id, work_order_id, qty, paid, task_date, note, subcontractor_id, work_orders(wo_number, contractor_id, archived, projects(quote_number, customers(name))), labour_items(code, description, contractor_rate)"
      )
      .order("task_date", { ascending: false }),
  ]);

  return <ContractorPaymentsTable subs={subs ?? []} lines={(lines ?? []) as any} />;
}
