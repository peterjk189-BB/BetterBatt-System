import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import CustomersTable from "./CustomersTable";

export default async function CustomersPage() {
  const supabase = await createClient();
  const [{ data }, role] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    getEffectiveRole(),
  ]);

  return <CustomersTable initial={data ?? []} isAdmin={role === "admin"} crmEnabled={role === "admin" || role === "office"} />;
}
