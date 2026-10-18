import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BusinessDashboard from "./BusinessDashboard";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  const [
    projects, projectLines, workOrders, woLines, labourItems, invoices, payments,
    swms, inspections, pos, poLines, stockParts, suppliers, subs,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, quote_number, job_type, outcome, entry_date, quote_markup, price_tier, archived, customers(name, discount_pct)"),
    supabase
      .from("project_lines")
      .select(
        "project_id, qty_m2, parts(coverage_m2, pack_cost_ex_gst, installer_rate_per_m2, supply_charge_per_pack, price_retail, price_trade, price_regency, supply_install_rate_per_m2)"
      ),
    supabase.from("work_orders").select("id, project_id, archived, completed_date"),
    supabase
      .from("work_order_lines")
      .select(
        "*, parts(coverage_m2, pack_cost_ex_gst, pack_per_multi, installer_rate_per_m2)"
      ),
    supabase.from("labour_items").select("id, contractor_rate"),
    supabase
      .from("invoices")
      .select("id, project_id, invoice_number, kind, amount_ex_gst, total, status, invoice_date, due_date, customers(name)"),
    supabase.from("invoice_payments").select("invoice_id, paid_on, amount"),
    supabase.from("swms").select("id, status, archived, swms_number, work_order_id").not("work_order_id", "is", null),
    supabase
      .from("inspections")
      .select("id, inspection_number, status, result, parent_inspection_id, archived, work_order_id")
      .not("work_order_id", "is", null),
    supabase.from("purchase_orders").select("id, status, archived"),
    supabase.from("purchase_order_lines").select("purchase_order_id, qty_pks, unit_cost"),
    supabase.from("parts").select("stock_on_hand, pack_cost_ex_gst, supplier_id, archived"),
    supabase.from("suppliers").select("id, name"),
    supabase.from("subcontractors").select("name, insurance_expiry, archived"),
  ]);

  const data = {
    projects: projects.data ?? [],
    projectLines: projectLines.data ?? [],
    workOrders: workOrders.data ?? [],
    woLines: woLines.data ?? [],
    labourItems: labourItems.data ?? [],
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    swms: swms.data ?? [],
    inspections: inspections.data ?? [],
    pos: pos.data ?? [],
    poLines: poLines.data ?? [],
    stockParts: stockParts.data ?? [],
    suppliers: suppliers.data ?? [],
    subs: subs.data ?? [],
  };
  const errors = [projects, workOrders, woLines, invoices, payments, stockParts].filter((r) => r?.error).map((r) => r.error!.message);

  return <BusinessDashboard data={data as any} errors={errors} />;
}
