import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { effectiveTabs } from "@/lib/tabs";

export const PREVIEW_COOKIE = "preview_user_id";

export type Previewing = { id: string; label: string; role: string } | null;

/**
 * Resolves which tab set actually applies to this request. Normally that's
 * just the signed-in user's own role/allowed_tabs. But if they're an admin
 * and have a "preview as" cookie set (via the PreviewBar control), it swaps
 * in the target user's tab set instead — so an admin can see exactly what
 * another user's nav looks like without a separate login.
 *
 * This only changes which tabs/pages are shown — it does not change what
 * the database allows. The admin's own session still has full data access
 * underneath, so a previewed page may show more data than that user would
 * actually see.
 */
// A cookie value of the form "role:office" or "role:installer" previews a
// generic default view for that role, with no real user account needed —
// useful for seeing what a role looks like before anyone's actually been
// invited as one.
export const SAMPLE_PREFIX = "role:";
const SAMPLE_ROLES = ["office", "installer"];

// defaultTabsForRole("installer") is deliberately empty — a *real* new
// installer gets nothing until an admin ticks tabs for them on the Users
// page. That's the right behaviour for a real account, but it means the
// no-login "Sample installer view" would otherwise show an empty "no
// access yet" dashboard, which defeats the point of a preview. So the
// sample preview uses this illustrative set instead — the tabs an
// installer would typically be granted — purely for showing what the
// nav/pages look like.
const SAMPLE_TABS: Record<string, string[]> = {
  installer: ["calendar", "swms", "work-orders"],
};

export async function resolveTabsForRequest(
  realRole: string | null | undefined,
  realAllowedTabs: string[] | null | undefined,
  realUserId: string
): Promise<{ tabs: string[]; previewing: Previewing }> {
  const isAdmin = realRole === "admin";
  if (isAdmin) {
    const cookieStore = await cookies();
    const previewValue = cookieStore.get(PREVIEW_COOKIE)?.value || null;

    if (previewValue && previewValue.startsWith(SAMPLE_PREFIX)) {
      const sampleRole = previewValue.slice(SAMPLE_PREFIX.length);
      if (SAMPLE_ROLES.includes(sampleRole)) {
        return {
          tabs: effectiveTabs(sampleRole, SAMPLE_TABS[sampleRole] ?? null),
          previewing: {
            id: previewValue,
            label: `Sample ${sampleRole} view (no login)`,
            role: sampleRole,
          },
        };
      }
    } else if (previewValue && previewValue !== realUserId) {
      const supabase = await createClient();
      const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, role, allowed_tabs")
        .eq("id", previewValue)
        .single();
      if (target) {
        return {
          tabs: effectiveTabs(target.role, target.allowed_tabs ?? null),
          previewing: {
            id: target.id,
            label: `${target.full_name || "Unnamed user"} (${target.role})`,
            role: target.role,
          },
        };
      }
    }
  }
  return { tabs: effectiveTabs(realRole, realAllowedTabs), previewing: null };
}
