import { createClient } from "@/lib/supabase/server";
import { quoteTotals } from "@/lib/quoteTotals";
import NewInvoice from "./NewInvoice";

export default async function NewInvoicePage({ searchParams }: { searchParams: { project_id?: string } }) {
  const supabase = await createClient();
  const projSel = "id, quote_number, job_type, lot_no, address, suburb, quote_markup, customer_id, contact_email, customers(name, discount_pct, payment_terms, contact_email)";
  const lineSel = "project_id, qty_m2, parts(coverage_m2, supply_charge_per_pack, supply_install_rate_per_m2";
  const loadProjects = (cols: string) =>
    supabase.from("projects").select(cols).eq("outcome", "Accepted").eq("archived", false).order("quote_number", { ascending: false });
  const [pr, ln, { data: invoices, error: invErr }, { data: customers }] = await Promise.all([
    loadProjects(projSel + ", price_tier"),
    supabase.from("project_lines").select(lineSel + ", price_retail, price_trade, price_regency)"),
    supabase.from("invoices").select("project_id, amount_ex_gst, status, kind").neq("status", "Void"),
    supabase.from("customers").select("id, name, payment_terms").eq("archived", false).order("name"),
  ]);
  let projects: any[] | null = pr.data as any;
  let lines: any[] | null = ln.data as any;
  const problems: string[] = [];
  // Older databases may not have the newer price-tier columns yet: retry without them
  if (pr.error) {
    const retry = await loadProjects(projSel);
    projects = retry.data as any;
    if (retry.error) problems.push("Could not load quotes: " + retry.error.message);
  }
  if (ln.error) {
    const retry = await supabase.from("project_lines").select(lineSel + ")");
    lines = retry.data as any;
    if (retry.error) problems.push("Could not load quote lines: " + retry.error.message);
  }
  if (invErr) problems.push("The invoices table is missing - run migrations 0031, 0032 and 0033 in Supabase.");
  if (pr.error || ln.error) problems.push("Run migration 0027 in Supabase so price tiers are used in quote totals.");

  const items = (projects ?? []).map((p: any) => {
    const t = quoteTotals(p, (lines ?? []).filter((l: any) => l.project_id === p.id) as any);
    const invoicedEx = (invoices ?? []).filter((i: any) => i.project_id === p.id).reduce((s: number, i: any) => s + Number(i.amount_ex_gst || 0), 0);
    return {
      id: p.id,
      quote_number: p.quote_number,
      lot_no: p.lot_no,
      address: p.address,
      suburb: p.suburb,
      customer_id: p.customer_id,
      customer_name: p.customers?.name ?? "",
      terms: p.customers?.payment_terms ?? null,
      quote_ex: Math.round(t.ex * 100) / 100,
      invoiced_ex: Math.round(invoicedEx * 100) / 100,
    };
  });

  return <NewInvoice quotes={items} customers={(customers ?? []) as any} initialProjectId={searchParams.project_id ?? ""} problems={problems} />;
}
