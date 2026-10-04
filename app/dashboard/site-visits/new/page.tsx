import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SiteVisitEditor from "../SiteVisitEditor";

export default async function NewSiteVisitPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: staff }, role] = await Promise.all([
    supabase.from("customers").select("id, name, contact_phone, contact_email").eq("archived", false).order("name"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    getEffectiveRole(),
  ]);

  return (
    <SiteVisitEditor visit={null} photos={[]} customers={customers ?? []} staff={staff ?? []} isAdmin={role === "admin"} />
  );
}
