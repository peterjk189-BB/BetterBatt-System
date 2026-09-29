import { createClient } from "@/lib/supabase/server";
import SubcontractorsTable from "./SubcontractorsTable";

export default async function SubcontractorsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("subcontractors").select("*").order("name");
  return <SubcontractorsTable initial={data ?? []} />;
}
