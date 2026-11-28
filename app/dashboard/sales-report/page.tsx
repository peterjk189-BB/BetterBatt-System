import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { quoteTotals } from "@/lib/quoteTotals";
import { unacceptedOptionLineIds } from "@/lib/quoteOptions";
import SalesReport from "./SalesReport";

export const dynamic = "force-dynamic";

const DEFAULT_TARGET = 2750000;

/** Directors' weekly Sales Report (replaces the QuickBooks Excel dashboard). Admin only. */
export default async function SalesReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/dashboard");

  // The server client reads every row in pages, so more than 1000 invoices are fine.
  const [invoices, invoiceLines, workOrders, projects, projectLines, settings] = await Promise.all([
    supabase.from("invoices").select("id, project_id, kind, amount_ex_gst, status, invoice_date, customers(name, category)"),
    supabase.from("invoice_lines").select("invoice_id, part_id, line_ex, invoices(status, invoice_date, project_id)").not("part_id", "is", null),
    supabase.from("work_orders").select("id, project_id, archived, completed_date, projects(customers(category))"),
    supabase.from("projects").select("*, customers(discount_pct)"),
    supabase
      .from("project_lines")
      .select("*, parts(coverage_m2, supply_charge_per_pack, supply_install_rate_per_m2, price_retail, price_trade, price_regency)"),
    supabase.from("company_settings").select("*").eq("id", true).maybeSingle(),
  ]);

  // Quote values ex GST, the same sum as the quote page (options not accepted are left out).
  const excluded = await unacceptedOptionLineIds(supabase);
  const linesBy = new Map<string, any[]>();
  for (const l of (projectLines.data ?? []) as any[]) {
    if (excluded.has(l.id)) continue;
    linesBy.set(l.project_id, [...(linesBy.get(l.project_id) ?? []), l]);
  }
  const quotes = ((projects.data ?? []) as any[]).map((p) => ({
    id: p.id,
    entry_date: p.entry_date,
    archived: p.archived,
    revision_letter: p.revision_letter ?? null,
    value: quoteTotals(p, linesBy.get(p.id) ?? []).ex,
  }));

  const target = Number((settings.data as any)?.annual_sales_target) || DEFAULT_TARGET;
  const targetSaved = (settings.data as any)?.annual_sales_target !== undefined;
  const errors = [invoices, invoiceLines, workOrders, projects].filter((r) => r.error).map((r) => r.error!.message);

  return (
    <SalesReport
      data={{
        invoices: (invoices.data ?? []) as any,
        invoiceLines: (invoiceLines.data ?? []) as any,
        workOrders: (workOrders.data ?? []) as any,
        quotes,
      }}
      initialTarget={target}
      targetSaved={targetSaved}
      errors={errors}
    />
  );
}
