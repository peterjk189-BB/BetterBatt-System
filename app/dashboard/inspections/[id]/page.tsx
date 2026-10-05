import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import InspectionEditor from "../InspectionEditor";

export default async function InspectionRecordPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: record }, { data: photos }, role] = await Promise.all([
    supabase.from("inspections").select("*, work_orders(wo_number), projects(quote_number)").eq("id", params.id).single(),
    supabase
      .from("attachments")
      .select("id, category, storage_path, file_name, caption, sort_order, created_at")
      .eq("inspection_id", params.id)
      .order("sort_order")
      .order("created_at"),
    getEffectiveRole(),
  ]);

  if (!record) notFound();

  return <InspectionEditor record={record as any} photos={(photos ?? []) as any} prefill={null} isAdmin={role === "admin"} />;
}
