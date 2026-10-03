import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SiteVisitEditor from "../SiteVisitEditor";

export default async function SiteVisitPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: visit }, { data: photos }, { data: customers }, role] = await Promise.all([
    supabase.from("site_visits").select("*, projects(quote_number)").eq("id", params.id).single(),
    supabase
      .from("attachments")
      .select("id, category, storage_path, file_name, caption, sort_order, created_at")
      .eq("site_visit_id", params.id)
      .order("sort_order")
      .order("created_at"),
    supabase.from("customers").select("id, name, contact_phone, contact_email").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  if (!visit) notFound();

  return (
    <SiteVisitEditor
      visit={visit as any}
      photos={(photos ?? []) as any}
      customers={customers ?? []}
      isAdmin={role === "admin"}
    />
  );
}
