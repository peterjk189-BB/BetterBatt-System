import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SwmsEditor from "../SwmsEditor";

export default async function SwmsRecordPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: record }, { data: photos }, role] = await Promise.all([
    supabase.from("swms").select("*, work_orders(wo_number), projects(quote_number)").eq("id", params.id).single(),
    supabase
      .from("attachments")
      .select("id, category, storage_path, file_name, caption, sort_order, created_at")
      .eq("swms_id", params.id)
      .order("sort_order")
      .order("created_at"),
    getEffectiveRole(),
  ]);

  if (!record) notFound();

  return <SwmsEditor record={record as any} photos={(photos ?? []) as any} prefill={null} isAdmin={role === "admin"} />;
}
