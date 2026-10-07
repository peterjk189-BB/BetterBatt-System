import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import PublicQuoteView from "./PublicQuoteView";

export default async function PublicQuotePage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select(
      "id, quote_number, job_type, lot_no, address, suburb, entry_date, notes, quote_markup, show_qty_on_quote, price_tier, contact_name, contact_phone, contact_email, accepted_at, accepted_name, customers(name, discount_pct)"
    )
    .eq("share_token", params.token)
    .single();

  if (!project) notFound();

  const [{ data: lines }, { data: settings }] = await Promise.all([
    admin
      .from("project_lines")
      .select("part_id, qty_m2, note, sort_order, parts(name, coverage_m2, supply_charge_per_pack, price_retail, price_trade, price_regency, supply_install_rate_per_m2)")
      .eq("project_id", project.id)
      .order("sort_order"),
    admin.from("company_settings").select("terms_and_conditions").eq("id", true).single(),
  ]);

  return (
    <PublicQuoteView
      project={project as any}
      lines={(lines ?? []) as any}
      termsAndConditions={settings?.terms_and_conditions ?? ""}
      token={params.token}
    />
  );
}
