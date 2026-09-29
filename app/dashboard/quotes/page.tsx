import { createClient } from "@/lib/supabase/server";
import QuotesList from "./QuotesList";

export default async function QuotesPage() {
  const supabase = await createClient();
  const [{ data: projects }, { data: lines }, { data: parts }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, quote_number, customer_id, job_type, category, outcome, suburb, entry_date, quote_markup, archived, customers(name)")
      .order("quote_number", { ascending: false }),
    supabase.from("project_lines").select("project_id, part_id, qty_m2"),
    supabase.from("parts").select("id, coverage_m2, supply_charge_per_pack, supply_install_rate_per_m2"),
  ]);

  return (
    <QuotesList
      initial={(projects ?? []) as any}
      lines={lines ?? []}
      parts={parts ?? []}
    />
  );
}
