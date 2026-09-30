import { createClient } from "@/lib/supabase/server";
import SubcontractorsTable from "./SubcontractorsTable";

export default async function SubcontractorsPage() {
  const supabase = await createClient();
  const [{ data }, { data: photos }] = await Promise.all([
    supabase.from("subcontractors").select("*").order("name"),
    supabase
      .from("attachments")
      .select("subcontractor_id, storage_path, created_at")
      .eq("category", "Profile Photo")
      .not("subcontractor_id", "is", null)
      .order("created_at", { ascending: false }),
  ]);
  return <SubcontractorsTable initial={data ?? []} photos={photos ?? []} />;
}
