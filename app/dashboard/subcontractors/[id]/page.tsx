import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubcontractorDetail from "./SubcontractorDetail";

export default async function SubcontractorDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: subcontractor }, { data: attachments }] = await Promise.all([
    supabase.from("subcontractors").select("*").eq("id", params.id).single(),
    supabase
      .from("attachments")
      .select("id, category, storage_path, file_name, created_at")
      .eq("subcontractor_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!subcontractor) notFound();

  return <SubcontractorDetail subcontractor={subcontractor as any} attachments={attachments ?? []} />;
}
