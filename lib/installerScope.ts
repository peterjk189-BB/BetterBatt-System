import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveRole, getEffectiveSubcontractorId } from "@/lib/currentUser";

export type InstallerScope = {
  subId: string | null;
  /** Authorised, non-archived work orders belonging to this contractor. */
  woIds: string[];
  /** Login accounts linked to this contractor (records they created themselves). */
  userIds: string[];
};

/**
 * For contractor (installer) views — including an admin using "Preview as" a
 * contractor — returns what that contractor is allowed to see. Returns null for
 * admin/office, who see everything. Archived jobs are never included.
 */
export async function getInstallerScope(supabase: SupabaseClient): Promise<InstallerScope | null> {
  const role = await getEffectiveRole();
  if (role !== "installer") return null;
  const subId = await getEffectiveSubcontractorId();
  if (!subId) return { subId: null, woIds: [], userIds: [] };
  const [{ data: wos }, { data: profs }] = await Promise.all([
    supabase.from("work_orders").select("*").eq("contractor_id", subId).eq("archived", false),
    supabase.from("profiles").select("id").eq("subcontractor_id", subId),
  ]);
  const woIds = ((wos ?? []) as any[])
    .filter((w) => !("authorised_at" in w) || w.authorised_at)
    .map((w) => w.id as string);
  return { subId, woIds, userIds: ((profs ?? []) as any[]).map((p) => p.id as string) };
}

/** Keep a SWMS/inspection row only if it's on this contractor's job or they created it. */
export function inScope(scope: InstallerScope, r: { work_order_id?: string | null; created_by?: string | null }): boolean {
  return (!!r.work_order_id && scope.woIds.includes(r.work_order_id)) || (!!r.created_by && scope.userIds.includes(r.created_by));
}
