import { createClient } from "@/lib/supabase/server";
import QuotesList from "./QuotesList";
import { unacceptedOptionLineIds } from "@/lib/quoteOptions";
import { sameSite } from "@/lib/siteAddress";

export default async function QuotesPage() {
  const supabase = await createClient();
  const projCols = "id, quote_number, customer_id, job_type, category, outcome, lot_no, address, suburb, entry_date, quote_markup, archived, customers(name, discount_pct)";
  const [projRes, { data: lines }, { data: parts }] = await Promise.all([
    // emailed_at / emailed_to exist after migration 0078; fall back without them until it is run.
    supabase.from("projects").select(projCols + ", emailed_at, emailed_to").order("quote_number", { ascending: false }),
    supabase.from("project_lines").select("id, project_id, part_id, qty_m2"),
    supabase.from("parts").select("id, name, coverage_m2, supply_charge_per_pack, supply_install_rate_per_m2"),
  ]);

  let projects: any[] | null = projRes.data as any;
  if (projRes.error) {
    const fb = await supabase.from("projects").select(projCols).order("quote_number", { ascending: false });
    projects = fb.data as any;
  }

  const excluded = await unacceptedOptionLineIds(supabase);

  // Site visits per quote: visits linked to the quote, plus visits booked for the same street address.
  const { data: visitRows } = await supabase
    .from("site_visits")
    .select("id, visit_number, visit_date, status, address, suburb, project_id")
    .eq("archived", false)
    .neq("status", "Cancelled")
    .order("visit_date", { ascending: false });
  const visits = (visitRows ?? []) as any[];
  const visitsByProject: Record<string, { id: string; number: number; date: string; status: string }[]> = {};
  for (const p of (projects ?? []) as any[]) {
    const hits = visits.filter((v) => v.project_id === p.id || (!v.project_id && sameSite(v, p)));
    if (hits.length) visitsByProject[p.id] = hits.map((v) => ({ id: v.id, number: v.visit_number, date: v.visit_date, status: v.status }));
  }

  return (
    <QuotesList
      initial={(projects ?? []) as any}
      lines={(lines ?? []).filter((l: any) => !excluded.has(l.id))}
      parts={parts ?? []}
      visitsByProject={visitsByProject}
    />
  );
}
