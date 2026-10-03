import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteVisitPrintView from "./SiteVisitPrintView";

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

  // Signed URLs are made server-side here so the print page renders its photos straight away.
  const signed: Record<string, string> = {};
  if (photos && photos.length > 0) {
    const { data } = await supabase.storage.from("attachments").createSignedUrls(
      photos.map((p) => p.storage_path),
      3600
    );
    for (const s of data ?? []) if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
  }

  return <SiteVisitPrintView visit={visit as any} photos={(photos ?? []) as any} urls={signed} />;
}
