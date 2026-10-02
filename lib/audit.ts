import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEventType = "login" | "create" | "update" | "delete";

/**
 * Best-effort audit log write. Never throws — a failed audit write should
 * never block the actual save/delete/login it's recording.
 */
export async function logAudit(
  supabase: SupabaseClient,
  params: {
    eventType: AuditEventType;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    details?: string | null;
  }
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let userName = (user.user_metadata?.full_name as string) || null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    if (profile?.full_name) userName = profile.full_name;

    await supabase.from("audit_log").insert({
      user_id: user.id,
      user_name: userName || user.email || null,
      event_type: params.eventType,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      entity_label: params.entityLabel ?? null,
      details: params.details ?? null,
    });
  } catch {
    // Swallow — audit logging must never break the real action.
  }
}
