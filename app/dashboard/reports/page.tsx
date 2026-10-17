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
    { data: jobWorkOrders },
    { data: jobSwms },
    { data: jobInspections },
    { data: jobLines },
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
    supabase
      .from("work_orders")
      .select(
        "id, wo_number, completed_date, entry_date, archived, jsa_received, projects(quote_number, address, suburb, customers(name)), subcontractors(name)"
      )
      .order("wo_number", { ascending: false }),
    supabase.from("swms").select("id, status, archived, swms_number, work_order_id").not("work_order_id", "is", null),
    supabase
      .from("inspections")
      .select("id, inspection_number, status, result, parent_inspection_id, archived, work_order_id")
      .not("work_order_id", "is", null),
    supabase.from("work_order_lines").select("work_order_id, task_date"),
  ]);

  return (
    <ReportsView
      parts={(parts ?? []) as any}
      poLines={(poLines ?? []) as any}
      woLines={(woLines ?? []) as any}
      projects={(projects ?? []) as any}
      projectLines={(projectLines ?? []) as any}
      jobWorkOrders={(jobWorkOrders ?? []) as any}
      jobSwms={(jobSwms ?? []) as any}
      jobInspections={(jobInspections ?? []) as any}
      jobLines={(jobLines ?? []) as any}
    />
  );
}
