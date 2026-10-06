import type { createClient } from "@/lib/supabase/client";
import { STAGES, addDaysISO, todayISO, type Stage } from "@/lib/crm";

type Db = ReturnType<typeof createClient>;

/** Auto follow-ups once a quote is out: a call at 3 days and again at 7. */
export async function createFollowUps(
  supabase: Db,
  lead: { id: string; name: string; owner_id: string | null },
  userId: string
) {
  const assignee = lead.owner_id || userId;
  const today = todayISO();
  const { error } = await supabase.from("crm_tasks").insert([
    { title: `Follow up quote — ${lead.name}`, kind: "Call", due_date: addDaysISO(today, 3), assigned_to: assignee, lead_id: lead.id, auto: true, created_by: userId },
    { title: `Second follow up — ${lead.name}`, kind: "Call", due_date: addDaysISO(today, 7), assigned_to: assignee, lead_id: lead.id, auto: true, created_by: userId },
  ]);
  return error;
}

/**
 * Moves a lead to a new stage. Reaching "Quote sent" creates the auto
 * follow-ups; Won / Lost clears the lead's open auto follow-ups.
 */
export async function moveStage(
  supabase: Db,
  lead: { id: string; name: string; owner_id: string | null },
  from: Stage,
  to: Stage,
  userId: string,
  lostReason?: string | null
): Promise<string | null> {
  const patch: Record<string, unknown> = { stage: to, lost_reason: to === "Lost" ? lostReason || null : null };
  const { error } = await supabase.from("crm_leads").update(patch).eq("id", lead.id);
  if (error) return error.message;

  if (to === "Quote sent" && STAGES.indexOf(from) < STAGES.indexOf("Quote sent")) {
    const e = await createFollowUps(supabase, lead, userId);
    if (e) return e.message;
  }
  if (to === "Won" || to === "Lost") {
    await supabase
      .from("crm_tasks")
      .update({ done: true, done_at: new Date().toISOString(), done_by: userId })
      .eq("lead_id", lead.id)
      .eq("done", false)
      .eq("auto", true);
  }
  return null;
}

/** Logs a note / call / email against a lead and/or customer, and stamps the customer's last contact. */
export async function logActivity(
  supabase: Db,
  a: { kind: string; note: string; lead_id?: string | null; customer_id?: string | null },
  userId: string
): Promise<string | null> {
  const { error } = await supabase.from("crm_activity").insert({
    kind: a.kind,
    note: a.note,
    lead_id: a.lead_id ?? null,
    customer_id: a.customer_id ?? null,
    created_by: userId,
  });
  if (error) return error.message;
  if (a.customer_id && a.kind !== "Note") {
    await supabase.from("customers").update({ last_contact_at: new Date().toISOString() }).eq("id", a.customer_id);
  }
  return null;
}
