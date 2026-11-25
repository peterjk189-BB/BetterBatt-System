// Certificate "sent" details: when, to whom, by whom, and the delivery report from the email service.
// The to/by/delivery columns exist once migration 0104 is run; until then only the sent date is kept.

export const CERT_SENT_COLS = "certificate_sent_at, certificate_sent_to, certificate_sent_by, certificate_delivery, certificate_delivery_at";

export type CertSent = {
  certificate_sent_at?: string | null;
  certificate_sent_to?: string | null;
  certificate_sent_by?: string | null;
  /** sent | delivered | bounced | complained | failed */
  certificate_delivery?: string | null;
  certificate_delivery_at?: string | null;
};

export function certDeliveryProblem(d?: string | null) {
  return d === "bounced" || d === "complained" || d === "failed";
}

/** Short label and colours for the delivery report, or null when there's nothing to show. */
export function certDeliveryBadge(c: CertSent): { text: string; cls: string } | null {
  if (!c.certificate_sent_at) return null;
  switch (c.certificate_delivery) {
    case "delivered":
      return { text: "Delivered", cls: "bg-green-100 text-green-800" };
    case "bounced":
      return { text: "Bounced", cls: "bg-red-100 text-red-800" };
    case "complained":
      return { text: "Marked as spam", cls: "bg-red-100 text-red-800" };
    case "failed":
      return { text: "Failed to send", cls: "bg-red-100 text-red-800" };
    case "sent":
      return { text: "Awaiting delivery", cls: "bg-[#f2f0ec] text-[#5f5d57]" };
    default:
      return null;
  }
}

export function fmtSentAt(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** One line: "Sent 25/11/2026, 11:20 am to a@b.com by Peter" (or "Marked sent 25/11/2026" when done by hand). */
export function certSentLine(c: CertSent) {
  if (!c.certificate_sent_at) return "";
  if (!c.certificate_sent_to) return `Marked sent ${new Date(c.certificate_sent_at).toLocaleDateString("en-AU")}`;
  return `Sent ${fmtSentAt(c.certificate_sent_at)} to ${c.certificate_sent_to}${c.certificate_sent_by ? ` by ${c.certificate_sent_by}` : ""}`;
}

/** Mark sent / not sent by hand. Clears the email details; falls back to the date alone before migration 0104. */
export async function setCertSentByHand(supabase: any, id: string, sent: boolean) {
  const value = sent ? new Date().toISOString() : null;
  const full = { certificate_sent_at: value, certificate_sent_to: null, certificate_sent_by: null, certificate_delivery: null, certificate_delivery_at: null };
  let r = await supabase.from("inspections").update(full).eq("id", id);
  if (r.error && /certificate_(sent_to|sent_by|delivery)/.test(r.error.message)) r = await supabase.from("inspections").update({ certificate_sent_at: value }).eq("id", id);
  return { error: r.error as { message: string } | null, value };
}
