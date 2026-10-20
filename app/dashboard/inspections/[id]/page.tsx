import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import InspectionEditor from "../InspectionEditor";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function InspectionRecordPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: record }, { data: photos }, { data: children }, role] = await Promise.all([
    supabase.from("inspections").select("*, work_orders(wo_number), projects(quote_number)").eq("id", params.id).single(),
    supabase
      .from("attachments")
      .select("id, category, storage_path, file_name, caption, sort_order, created_at")
      .eq("inspection_id", params.id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("inspections")
      .select("id, inspection_number, result")
      .eq("parent_inspection_id", params.id)
      .eq("archived", false)
      .order("inspection_number"),
    getEffectiveRole(),
  ]);

  if (!record) notFound();
  // Quote numbers are office-only: contractors never see them.
  if (role !== "admin" && role !== "office") (record as any).projects = null;
  const { data: subRows } = await supabase.from("subcontractors").select("id, name").eq("archived", false).order("name");
  const { data: staffRows } = await createAdminClient().from("profiles").select("id, full_name").order("full_name");

  let parent: { id: string; inspection_number: number } | null = null;
  if (record.parent_inspection_id) {
    const { data } = await supabase.from("inspections").select("id, inspection_number").eq("id", record.parent_inspection_id).single();
    parent = data ?? null;
  }

  return (
    <InspectionEditor
      record={record as any}
      photos={(photos ?? []) as any}
      prefill={null}
      isAdmin={role === "admin"}
      staff={(staffRows ?? []) as any}
      subcontractors={(subRows ?? []) as any}
      related={{ parent, children: (children ?? []) as any }}
    />
  );
}
