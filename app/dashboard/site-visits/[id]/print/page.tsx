import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteVisitPrintView from "./SiteVisitPrintView";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SiteVisitPrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: visit }, { data: photos }] = await Promise.all([
    supabase.from("site_visits").select("*, projects(quote_number)").eq("id", params.id).single(),
    supabase
      .from("attachments")
      .select("id, category, storage_path, file_name, caption, sort_order, created_at")
      .eq("site_visit_id", params.id)
      .order("sort_order")
      .order("created_at"),
  ]);

  if (!visit) notFound();

  // Names for "Assigned to" and the linked customer account (staff list needs the admin client).
  let assignedName: string | null = null;
  let customerAccount: string | null = null;
  const admin = createAdminClient();
  if ((visit as any).assigned_to) {
    const { data } = await admin.from("profiles").select("full_name").eq("id", (visit as any).assigned_to).single();
    assignedName = data?.full_name ?? null;
  }
  if ((visit as any).customer_id) {
    const { data } = await supabase.from("customers").select("name").eq("id", (visit as any).customer_id).single();
    customerAccount = data?.name ?? null;
  }

  // Signed URLs are made server-side here so the print page renders its photos straight away.
  const signed: Record<string, string> = {};
  if (photos && photos.length > 0) {
    const { data } = await supabase.storage.from("attachments").createSignedUrls(
      photos.map((p) => p.storage_path),
      3600
    );
    for (const s of data ?? []) if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
  }

  return <SiteVisitPrintView visit={visit as any} photos={(photos ?? []) as any} urls={signed} assignedName={assignedName} customerAccount={customerAccount} />;
}
