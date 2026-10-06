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

/**
 * Makes sure a site visit / quote has a CRM file (an enquiry). Finds the one
 * already linked (a quote made from a site visit reuses the visit's file),
 * otherwise creates it. Returns the lead id, or null if it couldn't be made.
 */
export async function ensureLead(
  supabase: Db,
  o: {
    siteVisitId?: string | null;
    projectId?: string | null;
    customerId?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    suburb?: string | null;
    from: string; // e.g. "site visit SV12" / "quote Q345"
  },
  userId: string
): Promise<string | null> {
  const conds: string[] = [];
  if (o.projectId) conds.push(`project_id.eq.${o.projectId}`);
  if (o.siteVisitId) conds.push(`site_visit_id.eq.${o.siteVisitId}`);
  if (conds.length) {
    const { data: found } = await supabase
      .from("crm_leads")
      .select("id, project_id, site_visit_id, customer_id")
      .or(conds.join(","))
      .eq("archived", false)
      .order("created_at")
      .limit(1);
    const lead = found?.[0];
    if (lead) {
      const patch: Record<string, unknown> = {};
      if (o.projectId && !lead.project_id) patch.project_id = o.projectId;
      if (o.siteVisitId && !lead.site_visit_id) patch.site_visit_id = o.siteVisitId;
      if (o.customerId && !lead.customer_id) patch.customer_id = o.customerId;
      if (Object.keys(patch).length) await supabase.from("crm_leads").update(patch).eq("id", lead.id);
      return lead.id as string;
    }
  }
  const { data, error } = await supabase
    .from("crm_leads")
    .insert({
      name: (o.name || o.address || "New customer").trim(),
      phone: o.phone || null,
      email: o.email || null,
      address: o.address || null,
      suburb: o.suburb || null,
      source: "Other",
      stage: o.projectId ? "Quote sent" : o.siteVisitId ? "Site visit booked" : "New enquiry",
      customer_id: o.customerId || null,
      project_id: o.projectId || null,
      site_visit_id: o.siteVisitId || null,
      owner_id: userId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  await logActivity(supabase, { kind: "Note", note: `CRM file created from ${o.from}.`, lead_id: data.id, customer_id: o.customerId || null }, userId);
  if (o.projectId) {
    await createFollowUps(supabase, { id: data.id, name: (o.name || o.address || "New customer").trim(), owner_id: userId }, userId);
  }
  return data.id as string;
}
