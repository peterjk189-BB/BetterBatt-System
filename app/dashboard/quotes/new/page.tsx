import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import QuoteEditor from "../QuoteEditor";

export default async function NewQuotePage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: parts }, role] = await Promise.all([
    supabase.from("customers").select("*").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  return (
    <QuoteEditor project={null} lines={[]} customers={customers ?? []} parts={parts ?? []} isAdmin={role === "admin"} />
  );
}
