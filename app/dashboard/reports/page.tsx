import { createClient } from "@/lib/supabase/server";
import ReportsView from "./ReportsView";

export default async function ReportsPage() {
  const supabase = await createClient();

  const [
    { data: parts },
    { data: poLines },
    { data: woLines },
    { data: projects },
    { data: projectLines },
  ] = await Promise.all([
    supabase
      .from("parts")
      .select("id, code, name, coverage_m2, pack_cost_ex_gst, pack_per_multi, stock_on_hand, archived")
      .order("name"),
    supabase
      .from("purchase_order_lines")
      .select(
        "id, purchase_order_id, part_id, qty_pks, unit_cost, received_multi, received_pks, purchase_orders(po_number, supplier_id, status, order_date, delivery_date, archived, updated_at, suppliers(name))"
      ),
    supabase
      .from("work_order_lines")
      .select("id, task_date, part_id, qty, work_orders(archived)")
      .not("part_id", "is", null),
    supabase
      .from("projects")
      .select(
        "id, quote_number, customer_id, job_type, outcome, entry_date, quote_markup, price_tier, archived, customers(name, discount_pct)"
      )
      .order("entry_date", { ascending: false }),
    supabase
      .from("project_lines")
      .select(
        "id, project_id, qty_m2, parts(coverage_m2, pack_cost_ex_gst, installer_rate_per_m2, supply_charge_per_pack, price_retail, price_trade, price_regency, supply_install_rate_per_m2)"
      ),
  ]);

  return (
    <ReportsView
      parts={(parts ?? []) as any}
      poLines={(poLines ?? []) as any}
      woLines={(woLines ?? []) as any}
      projects={(projects ?? []) as any}
      projectLines={(projectLines ?? []) as any}
    />
  );
}
