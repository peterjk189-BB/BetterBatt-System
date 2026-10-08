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
 * one 30 days before and one 7 days before expiry (skipping any date already past,
 * with a single catch-up reminder for today if both have), assigned to the person who saved it. Earlier open reminders for the same
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
  const mk = (due: string, label: string) => ({
    title: `${title} (${label})`,
    kind: "Call",
    due_date: due,
    assigned_to: userId,
    created_by: userId,
    note: `Public liability certificate expires ${expiry}. Ask for the renewed certificate of currency and upload it on the Subcontractors page.`,
  });
  // Only reminders that are still in the future are worth creating. If the 30-day and
  // 7-day dates have both passed already, one catch-up reminder due today is enough —
  // creating both just puts two overdue copies on the dashboard.
  const rows: ReturnType<typeof mk>[] = [];
  const d30 = addDaysISO(expiry, -30);
  const d7 = addDaysISO(expiry, -7);
  if (d30 >= today) rows.push(mk(d30, "expires in 30 days"));
  if (d7 >= today) rows.push(mk(d7, "expires in 7 days"));
  if (rows.length === 0) {
    const days = daysBetween(today, expiry);
    rows.push(
      mk(
        today,
        days < 0 ? `expired ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "expires today" : `expires in ${days} day${days === 1 ? "" : "s"}`
      )
    );
  }
  const { error } = await supabase.from("crm_tasks").insert(rows);
  return error ? error.message : null;
}
