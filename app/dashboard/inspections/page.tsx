import { createClient } from "@/lib/supabase/server";
import InspectionsList from "./InspectionsList";

export default async function InspectionsPage() {
  const supabase = await createClient();
  const { data: records } = await supabase
    .from("inspections")
    .select(
      "id, inspection_number, inspection_date, status, result, builder_name, site_address, suburb, include_foil, include_wall, include_ceiling, archived, work_orders(wo_number), projects(quote_number)"
    )
    .order("inspection_date", { ascending: false })
    .order("inspection_number", { ascending: false });

  return <InspectionsList initial={(records ?? []) as any} />;
}
