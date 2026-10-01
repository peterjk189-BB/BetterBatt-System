import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuotePrintView from "./QuotePrintView";

export default async function QuotePrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: project }, { data: lines }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, quote_number, job_type, lot_no, address, suburb, entry_date, notes, quote_markup, show_qty_on_quote, contact_name, contact_phone, contact_email, customers(name, discount_pct)"
      )
      .eq("id", params.id)
      .single(),
    supabase
      .from("project_lines")
      .select("part_id, qty_m2, note, sort_order, parts(name, coverage_m2, supply_charge_per_pack, supply_install_rate_per_m2)")
      .eq("project_id", params.id)
      .order("sort_order"),
  ]);

  if (!project) notFound();

  return <QuotePrintView project={project as any} lines={(lines ?? []) as any} />;
}
