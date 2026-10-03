import { createClient } from "@/lib/supabase/server";
import SiteVisitsList from "./SiteVisitsList";

export default async function SiteVisitsPage() {
  const supabase = await createClient();
  const [{ data: visits }, { data: photoRows }] = await Promise.all([
    supabase
      .from("site_visits")
      .select(
        "id, visit_number, visit_date, visit_time, status, visit_type, customer_name, phone, address, suburb, checklist, project_id, archived, projects(quote_number)"
      )
      .order("visit_date", { ascending: false })
      .order("visit_number", { ascending: false }),
    supabase.from("attachments").select("site_visit_id").not("site_visit_id", "is", null),
  ]);

  const photoCounts: Record<string, number> = {};
  for (const r of photoRows ?? []) {
    const id = (r as { site_visit_id: string }).site_visit_id;
    photoCounts[id] = (photoCounts[id] || 0) + 1;
  }

  return <SiteVisitsList initial={(visits ?? []) as any} photoCounts={photoCounts} />;
}
