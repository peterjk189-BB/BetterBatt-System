import { createClient } from "@/lib/supabase/server";
import { resolveTabsForRequest, SAMPLE_PREFIX } from "@/lib/preview";

/** The signed-in user's actual role, or null if not signed in / no profile row yet. */
export async function getCurrentUserRole(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role ?? null;
}

/**
 * Like getCurrentUserRole, but if an admin is using "Preview as" to see
 * another user's view, this returns that user's role instead. Use this
 * (rather than getCurrentUserRole) for admin-only UI like Archive buttons,
 * so previewing stays faithful to what the previewed user would actually see.
 */
export async function getEffectiveRole(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, allowed_tabs").eq("id", user.id).single();
  const { previewing } = await resolveTabsForRequest(profile?.role ?? null, profile?.allowed_tabs ?? null, user.id);
  return previewing ? previewing.role : profile?.role ?? null;
}

/**
 * The subcontractor an installer's own jobs are filtered by (profiles.subcontractor_id),
 * honouring "Preview as" the same way getEffectiveRole does. Returns null for
 * admin/office, for the no-login sample installer preview (no real installer
 * to scope to), or if nothing is linked yet.
 */
export async function getEffectiveSubcontractorId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, allowed_tabs, subcontractor_id").eq("id", user.id).single();
  const { previewing } = await resolveTabsForRequest(profile?.role ?? null, profile?.allowed_tabs ?? null, user.id);
  if (!previewing) return profile?.subcontractor_id ?? null;
  if (previewing.id.startsWith(SAMPLE_PREFIX)) return null;
  const { data: target } = await supabase.from("profiles").select("subcontractor_id").eq("id", previewing.id).single();
  return target?.subcontractor_id ?? null;
}
