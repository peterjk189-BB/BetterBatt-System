import { createClient } from "@/lib/supabase/server";
import { resolveTabsForRequest } from "@/lib/preview";

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
