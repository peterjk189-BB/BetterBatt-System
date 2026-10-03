import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SiteVisitEditor from "../SiteVisitEditor";

export default async function NewSiteVisitPage() {
  const supabase = await createClient();
  const [{ data: customers }, role] = await Promise.all([
    supabase.from("customers").select("id, name, contact_phone, contact_email").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  return <SiteVisitEditor visit={null} photos={[]} customers={customers ?? []} isAdmin={role === "admin"} />;
}
