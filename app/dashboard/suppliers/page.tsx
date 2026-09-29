import { createClient } from "@/lib/supabase/server";
import SuppliersTable from "./SuppliersTable";

export default async function SuppliersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").order("name");
  return <SuppliersTable initial={data ?? []} />;
}
