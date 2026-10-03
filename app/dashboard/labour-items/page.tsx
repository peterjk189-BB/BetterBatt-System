import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import LabourItemsTable from "./LabourItemsTable";

export default async function LabourItemsPage() {
  const supabase = await createClient();
  const [{ data }, role] = await Promise.all([
    supabase.from("labour_items").select("*").order("code"),
    getEffectiveRole(),
  ]);
  return <LabourItemsTable initial={data ?? []} isAdmin={role === "admin"} />;
}
