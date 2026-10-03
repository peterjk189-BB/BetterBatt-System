import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SuppliersTable from "./SuppliersTable";

export default async function SuppliersPage() {
  const supabase = await createClient();
  const [{ data }, role] = await Promise.all([
    supabase.from("suppliers").select("*").order("name"),
    getEffectiveRole(),
  ]);
  return <SuppliersTable initial={data ?? []} isAdmin={role === "admin"} />;
}
