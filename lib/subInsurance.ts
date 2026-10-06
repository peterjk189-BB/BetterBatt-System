import { addDaysISO, daysBetween, todayISO } from "@/lib/crm";

export type InsuranceStatus = { label: string; tone: "none" | "ok" | "soon" | "expired"; days: number | null };

/** Where a contractor's public liability cover stands today. */
export function insuranceStatus(expiry: string | null | undefined, today = todayISO()): InsuranceStatus {
  if (!expiry) return { label: "No insurance on file", tone: "none", days: null };
  const days = daysBetween(today, expiry);
  if (days < 0) return { label: `Expired ${-days} day${days === -1 ? "" : "s"} ago`, tone: "expired", days };
  if (days === 0) return { label: "Expires today", tone: "expired", days };
  if (days <= 30) return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, tone: "soon", days };
  return { label: "Insured", tone: "ok", days };
}

export const TONE_STYLES: Record<InsuranceStatus["tone"], string> = {
  none: "bg-gray-200 text-gray-700",
  ok: "bg-green-100 text-green-800",
  soon: "bg-[#fff4d6] text-[#7a5a0f]",
  expired: "bg-[#fde8e8] text-[#b91c1c]",
};

const reminderTitle = (name: string) => `Insurance renewal — ${name}`;

/**
 * (Re)creates CRM follow-up reminders for a contractor's insurance expiry:
 * one 30 days before and one 7 days before (or today if that has passed),
 * assigned to the person who saved it. Earlier open reminders for the same
 * contractor are closed first, so renewing doesn't leave stale ones behind.
 */
export async function setInsuranceReminders(
  supabase: any,
  sub: { id: string; name: string },
  expiry: string | null,
  userId: string
): Promise<string | null> {
  const title = reminderTitle(sub.name);
  await supabase
    .from("crm_tasks")
    .update({ done: true, done_at: new Date().toISOString(), done_by: userId })
    .like("title", `${title}%`)
    .eq("done", false);
  if (!expiry) return null;
  const today = todayISO();
  const mk = (days: number, label: string) => ({
    title: `${title} (${label})`,
    kind: "Call",
    due_date: addDaysISO(expiry, -days) < today ? today : addDaysISO(expiry, -days),
    assigned_to: userId,
    created_by: userId,
    note: `Public liability certificate expires ${expiry}. Ask for the renewed certificate of currency and upload it on the Subcontractors page.`,
  });
  const rows = [mk(30, "expires in 30 days"), mk(7, "expires in 7 days")];
  const { error } = await supabase.from("crm_tasks").insert(rows);
  return error ? error.message : null;
}
