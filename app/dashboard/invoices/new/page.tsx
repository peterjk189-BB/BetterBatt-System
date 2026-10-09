import { createClient } from "@/lib/supabase/server";
import { quoteTotals } from "@/lib/quoteTotals";
import NewInvoice from "./NewInvoice";

export default async function NewInvoicePage({ searchParams }: { searchParams: { project_id?: string } }) {
  const supabase = await createClient();
  const [{ data: projects }, { data: lines }, { data: invoices }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, quote_number, job_type, lot_no, address, suburb, quote_markup, price_tier, customer_id, contact_email, customers(name, discount_pct, payment_terms, contact_email)")
      .eq("outcome", "Accepted")
      .eq("archived", false)
      .order("quote_number", { ascending: false }),
    supabase
      .from("project_lines")
      .select("project_id, qty_m2, parts(coverage_m2, supply_charge_per_pack, supply_install_rate_per_m2, price_retail, price_trade, price_regency)"),
    supabase.from("invoices").select("project_id, amount_ex_gst, status, kind").neq("status", "Void"),
  ]);

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

  return <NewInvoice quotes={items} initialProjectId={searchParams.project_id ?? ""} />;
}
