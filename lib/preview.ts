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
export async function resolveTabsForRequest(
  realRole: string | null | undefined,
  realAllowedTabs: string[] | null | undefined,
  realUserId: string
): Promise<{ tabs: string[]; previewing: Previewing }> {
  const isAdmin = realRole === "admin";
  if (isAdmin) {
    const cookieStore = await cookies();
    const previewUserId = cookieStore.get(PREVIEW_COOKIE)?.value || null;
    if (previewUserId && previewUserId !== realUserId) {
      const supabase = await createClient();
      const { data: target } = await supabase
        .from("profiles")
        .select("id, full_name, role, allowed_tabs")
        .eq("id", previewUserId)
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
