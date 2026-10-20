import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SwmsList from "./SwmsList";

export default async function SwmsPage() {
  const supabase = await createClient();
  const role = await getEffectiveRole();
  const { data: records } = await supabase
    .from("swms")
    .select(
      "id, swms_number, job_date, job_type, status, builder_name, site_address, suburb, work_order_id, project_id, archived, work_orders(wo_number), projects(quote_number)"
    )
    .order("job_date", { ascending: false })
    .order("swms_number", { ascending: false });

  const staff = role === "admin" || role === "office";
  const rows = (records ?? []).map((r: any) => (staff ? r : { ...r, projects: null }));
  return <SwmsList initial={rows as any} />;
}
