import { createClient } from "@/lib/supabase/server";
import ReportsView from "./ReportsView";
import { unacceptedOptionLineIds } from "@/lib/quoteOptions";

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
    { data: plWoLines },
    { data: labourItems },
    { data: plInvoices, error: invErr },
    { data: plPayments },
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
        "id, quote_number, customer_id, job_type, outcome, entry_date, quote_markup, price_tier, archived, address, suburb, customers(name, discount_pct)"
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
        "id, wo_number, project_id, completed_date, entry_date, archived, jsa_received, projects(quote_number, address, suburb, customers(name)), subcontractors(name)"
      )
      .order("wo_number", { ascending: false }),
    supabase.from("swms").select("id, status, archived, swms_number, work_order_id").not("work_order_id", "is", null),
    supabase
      .from("inspections")
      .select("id, inspection_number, status, result, parent_inspection_id, archived, work_order_id")
      .not("work_order_id", "is", null),
    supabase.from("work_order_lines").select("work_order_id, task_date"),
    supabase
      .from("work_order_lines")
      .select(
        "*, parts(coverage_m2, pack_cost_ex_gst, pack_per_multi, installer_rate_per_m2)"
      ),
    supabase.from("labour_items").select("id, contractor_rate"),
    supabase
      .from("invoices")
      .select("id, project_id, customer_id, kind, amount_ex_gst, total, status, invoice_date, customers(name)"),
    supabase.from("invoice_payments").select("invoice_id, amount"),
  ]);

  // Lines of item / counter invoices, with the part's pack cost, so counter sales get a profit figure.
  const { data: plInvLines } = await supabase
    .from("invoice_lines")
    .select("invoice_id, part_id, qty, line_ex, parts(pack_cost_ex_gst)");

  const excluded = await unacceptedOptionLineIds(supabase);
  const countedProjectLines = (projectLines ?? []).filter((l: any) => !excluded.has(l.id));

  // Fuel levies per purchase order (columns exist only after migration 0058).
  const fuelRes = await supabase.from("purchase_orders").select("id, fuel_levy_type, fuel_levy_value");
  const poFuel = fuelRes.error ? [] : fuelRes.data ?? [];

  return (
    <ReportsView
      parts={(parts ?? []) as any}
      poLines={(poLines ?? []) as any}
      poFuel={poFuel as any}
      woLines={(woLines ?? []) as any}
      projects={(projects ?? []) as any}
      projectLines={countedProjectLines as any}
      jobWorkOrders={(jobWorkOrders ?? []) as any}
      jobSwms={(jobSwms ?? []) as any}
      jobInspections={(jobInspections ?? []) as any}
      jobLines={(jobLines ?? []) as any}
      pl={{
        projects: (projects ?? []) as any,
        projectLines: countedProjectLines as any,
        workOrders: (jobWorkOrders ?? []) as any,
        woLines: (plWoLines ?? []) as any,
        labourItems: (labourItems ?? []) as any,
        invoices: (plInvoices ?? []) as any,
        invoiceLines: (plInvLines ?? []) as any,
        payments: (plPayments ?? []) as any,
        invoicesAvailable: !invErr,
      }}
    />
  );
}
