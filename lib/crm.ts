// Shared types, option lists and helpers for the CRM: the enquiries
// pipeline, follow-up tasks, activity log and repeat-work check-ins.

export const STAGES = ["New enquiry", "Site visit booked", "Quote sent", "Following up", "Won", "Lost"] as const;
export type Stage = (typeof STAGES)[number];

export const SOURCES = ["Call", "Email", "Website", "Builder", "Repeat customer", "Referral", "Other"] as const;
export const LOST_REASONS = ["Price", "Timing", "Went with a competitor", "No response", "Not suitable", "Other"] as const;
export const TASK_KINDS = ["Call", "Email", "Visit", "Other"] as const;
export const ACTIVITY_KINDS = ["Note", "Call", "Email", "Meeting"] as const;

export const STAGE_STYLES: Record<Stage, string> = {
  "New enquiry": "bg-[#e8f0fe] text-[#1e4fbf] border-[#bcd0fb]",
  "Site visit booked": "bg-[#fff4d6] text-[#7a5a0f] border-[#f3d48a]",
  "Quote sent": "bg-[#f1e8fb] text-[#5b2a8a] border-[#d9c2f0]",
  "Following up": "bg-[#fde8e8] text-[#b91c1c] border-[#f5b5b5]",
  Won: "bg-[#e6f4ea] text-[#1f6b35] border-[#b7dfc2]",
  Lost: "bg-[#f1f0ed] text-[#6b6862] border-[#e4e1da]",
};

export type Staff = { id: string; full_name: string | null };

export type Lead = {
  id: string;
  lead_number: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  suburb: string | null;
  source: string;
  enquiry_note: string | null;
  stage: Stage;
  lost_reason: string | null;
  customer_id: string | null;
  project_id: string | null;
  site_visit_id: string | null;
  owner_id: string | null;
  est_value: number | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  customers?: { name: string } | null;
  projects?: { quote_number: number; outcome: string } | null;
  site_visits?: { visit_number: number; status: string } | null;
};

export type Task = {
  id: string;
  title: string;
  kind: string;
  due_date: string;
  assigned_to: string;
  lead_id: string | null;
  customer_id: string | null;
  note: string | null;
  done: boolean;
  done_at: string | null;
  auto: boolean;
  leads?: { name: string } | null;
  customers?: { name: string } | null;
};

export type Activity = {
  id: string;
  kind: string;
  note: string;
  created_by: string | null;
  created_at: string;
};

export function staffName(staff: Staff[], id: string | null | undefined) {
  if (!id) return "Unassigned";
  return staff.find((s) => s.id === id)?.full_name || "Unnamed user";
}

/** Today as YYYY-MM-DD in the browser's local time zone. */
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00").getTime();
  const b = new Date(toISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export function dueLabel(due: string, today: string): { text: string; overdue: boolean } {
  const n = daysBetween(today, due);
  if (n < 0) return { text: n === -1 ? "1 day overdue" : `${-n} days overdue`, overdue: true };
  if (n === 0) return { text: "Today", overdue: false };
  if (n === 1) return { text: "Tomorrow", overdue: false };
  return { text: fmtDay(due), overdue: false };
}

/**
 * The stage a lead should show on the board. The stored stage is what people
 * set by hand; linked quotes and site visits can only move it forward, never
 * back, and an accepted / lost quote settles it as Won / Lost.
 */
export function effectiveStage(l: Pick<Lead, "stage" | "projects" | "site_visits">): Stage {
  if (l.stage === "Won" || l.stage === "Lost") return l.stage;
  const rank = (s: Stage) => STAGES.indexOf(s);
  let stage: Stage = l.stage;
  const outcome = l.projects?.outcome;
  if (outcome === "Accepted") return "Won";
  if (outcome === "Lost" || outcome === "Cancelled") return "Lost";
  if (l.projects && rank(stage) < rank("Quote sent")) stage = "Quote sent";
  if (l.site_visits && rank(stage) < rank("Site visit booked")) stage = "Site visit booked";
  return stage;
}

export function digits(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

/** Next check-in date for a customer, or null if none is set. A customer never contacted is due now. */
export function nextCheckin(everyDays: number | null, lastContactAt: string | null, today: string): string | null {
  if (!everyDays) return null;
  if (!lastContactAt) return today;
  return addDaysISO(lastContactAt.slice(0, 10), everyDays);
}
