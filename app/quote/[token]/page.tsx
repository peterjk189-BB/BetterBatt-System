import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import PublicQuoteView from "./PublicQuoteView";
import { recordQuoteView } from "@/lib/quoteViews";

// Always rebuild from the latest quote: a revised price must show on the customer's link straight away.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicQuotePage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("*, customers(name, discount_pct)")
    .eq("share_token", params.token)
    .single();

  if (!project) notFound();

  await recordQuoteView(admin, project);

  // Office-only fields never go to the customer's browser.
  const publicProject = { ...(project as any) };
  delete publicProject.internal_notes;
  delete publicProject.contractor_notes;
  delete publicProject.first_viewed_at;
  delete publicProject.last_viewed_at;
  delete publicProject.view_count;

  let newerToken: string | null = null;
  if ((project as any).outcome === "Superseded") {
    const { data: sibs } = await admin
      .from("projects")
      .select("share_token, revision_letter, outcome")
      .eq("quote_number", (project as any).quote_number);
    const live = ((sibs ?? []) as any[]).filter((r) => r.outcome !== "Superseded").sort((a, b) => String(b.revision_letter || "").localeCompare(String(a.revision_letter || "")));
    newerToken = live[0]?.share_token ?? null;
  }

  const [{ data: lines }, { data: settings }] = await Promise.all([
    admin
      .from("project_lines")
      .select("*, parts(name, coverage_m2, supply_charge_per_pack, price_retail, price_trade, price_regency, supply_install_rate_per_m2)")
      .eq("project_id", project.id)
      .order("sort_order"),
    admin.from("company_settings").select("terms_and_conditions").eq("id", true).single(),
  ]);

  return (
    <PublicQuoteView
      project={publicProject}
      lines={(lines ?? []) as any}
      termsAndConditions={settings?.terms_and_conditions ?? ""}
      token={params.token}
      newerToken={newerToken}
    />
  );
}
