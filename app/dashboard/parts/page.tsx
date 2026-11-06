import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import PartsTable from "./PartsTable";
import { packsNeeded } from "@/lib/picking";

export default async function PartsPage() {
  const supabase = await createClient();
  const [{ data: parts }, { data: suppliers }, role] = await Promise.all([
    supabase.from("parts").select("*").order("name"),
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  // Stock set aside ("Allocated") on picking slips for work orders that haven't been picked yet.
  const { data: held } = await supabase
    .from("work_order_lines")
    .select("part_id, qty, work_order_id, parts(coverage_m2), work_orders!inner(id, wo_number, archived, projects(address, suburb))")
    .eq("allocated", true)
    .eq("picked", false)
    .eq("work_orders.archived", false);
  const reservations: Record<string, { total: number; jobs: { woId: string; woNumber: string; site: string; packs: number }[] }> = {};
  for (const r of (held ?? []) as any[]) {
    if (!r.part_id) continue;
    const wo = Array.isArray(r.work_orders) ? r.work_orders[0] : r.work_orders;
    const proj = Array.isArray(wo?.projects) ? wo.projects[0] : wo?.projects;
    const packs = packsNeeded(Number(r.qty) || 0, Number(r.parts?.coverage_m2) || 0);
    if (!packs) continue;
    const entry = (reservations[r.part_id] ||= { total: 0, jobs: [] });
    entry.total += packs;
    const site = [proj?.address, proj?.suburb].filter(Boolean).join(", ");
    const existing = entry.jobs.find((j) => j.woId === r.work_order_id);
    if (existing) existing.packs += packs;
    else entry.jobs.push({ woId: r.work_order_id, woNumber: wo?.wo_number || "WO", site, packs });
  }

  return <PartsTable initial={parts ?? []} suppliers={suppliers ?? []} isAdmin={role === "admin"} reservations={reservations} />;
}
