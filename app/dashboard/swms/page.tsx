import { createClient } from "@/lib/supabase/server";
import SwmsList from "./SwmsList";

export default async function SwmsPage() {
  const supabase = await createClient();
  const { data: records } = await supabase
    .from("swms")
    .select(
      "id, swms_number, job_date, job_type, status, builder_name, site_address, suburb, work_order_id, project_id, archived, work_orders(wo_number), projects(quote_number)"
    )
    .order("job_date", { ascending: false })
    .order("swms_number", { ascending: false });

  return <SwmsList initial={(records ?? []) as any} />;
}
