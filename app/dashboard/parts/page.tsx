import { createClient } from "@/lib/supabase/server";
import PartsTable from "./PartsTable";

export default async function PartsPage() {
  const supabase = await createClient();
  const [{ data: parts }, { data: suppliers }] = await Promise.all([
    supabase.from("parts").select("*").order("name"),
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
  ]);

  return <PartsTable initial={parts ?? []} suppliers={suppliers ?? []} />;
}
