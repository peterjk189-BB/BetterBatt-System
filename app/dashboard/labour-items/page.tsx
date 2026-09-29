import { createClient } from "@/lib/supabase/server";
import LabourItemsTable from "./LabourItemsTable";

export default async function LabourItemsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("labour_items").select("*").order("code");
  return <LabourItemsTable initial={data ?? []} />;
}
