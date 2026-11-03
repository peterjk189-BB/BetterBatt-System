import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import QuoteEditor from "../QuoteEditor";

export default async function QuotePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: project }, { data: lines }, { data: customers }, { data: parts }, role, { data: workOrders }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", params.id).single(),
    supabase.from("project_lines").select("*").eq("project_id", params.id).order("sort_order"),
    supabase.from("customers").select("*").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
    getEffectiveRole(),
    supabase
      .from("work_orders")
      .select("id, wo_number, entry_date, completed_date, authorised_at, subcontractors(name)")
      .eq("project_id", params.id)
      .eq("archived", false)
      .order("created_at"),
  ]);

  if (!project) notFound();

  // Lines can point at a product that has since been archived in Inventory (e.g. replaced by a newer
  // version). Load those too, so the line still shows its product instead of a blank picker.
  const activeIds = new Set((parts ?? []).map((p: any) => p.id));
  const missingIds = Array.from(new Set((lines ?? []).map((l: any) => l.part_id).filter((id: string | null) => id && !activeIds.has(id))));
  let archivedParts: any[] = [];
  if (missingIds.length > 0) {
    const { data } = await supabase.from("parts").select("*").in("id", missingIds);
    archivedParts = ((data ?? []) as any[]).map((p) => ({ ...p, name: `${p.name} (archived)` }));
  }

  return (
    <QuoteEditor
      project={project}
      lines={lines ?? []}
      customers={customers ?? []}
      parts={[...(parts ?? []), ...archivedParts]}
      workOrders={(workOrders ?? []) as any}
      isAdmin={role === "admin"}
      crmEnabled={role === "admin" || role === "office"}
    />
  );
}
