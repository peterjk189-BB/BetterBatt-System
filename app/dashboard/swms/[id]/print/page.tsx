import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SwmsPrintView from "./SwmsPrintView";

export default async function SwmsPrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: record }, { data: photos }] = await Promise.all([
    supabase.from("swms").select("*, work_orders(wo_number), projects(quote_number)").eq("id", params.id).single(),
    supabase
      .from("attachments")
      .select("id, category, storage_path, file_name, caption, sort_order, created_at")
      .eq("swms_id", params.id)
      .order("sort_order")
      .order("created_at"),
  ]);

  if (!record) notFound();

  const signed: Record<string, string> = {};
  if (photos && photos.length > 0) {
    const { data } = await supabase.storage.from("attachments").createSignedUrls(
      photos.map((p) => p.storage_path),
      3600
    );
    for (const s of data ?? []) if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
  }

  return <SwmsPrintView record={record as any} photos={(photos ?? []) as any} urls={signed} />;
}
