import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAlert } from "@/lib/alerts";

// Resend calls this when an email bounces, is marked as spam, or fails. It signs the call (Svix), so the
// secret from Resend (RESEND_WEBHOOK_SECRET, starts "whsec_") is checked before anything is trusted.
export const dynamic = "force-dynamic";

function verify(secret: string, id: string, timestamp: string, signatureHeader: string, body: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return signatureHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not set" }, { status: 500 });
  const body = await req.text();
  const id = req.headers.get("svix-id") || "";
  const ts = req.headers.get("svix-timestamp") || "";
  const sig = req.headers.get("svix-signature") || "";
  // Reject stale or forged calls.
  if (!id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60 || !verify(secret, id, ts, sig, body)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  const type: string = event?.type || "";
  const label: Record<string, string> = {
    "email.bounced": "bounced",
    "email.complained": "was marked as spam",
    "email.failed": "failed to send",
  };
  if (!label[type]) return NextResponse.json({ ok: true, ignored: true });

  const d = event.data || {};
  const to = (Array.isArray(d.to) ? d.to[0] : d.to) || "an address";
  const subject: string = d.subject || "";
  const tags = d.tags || {};
  const woId: string | undefined = Array.isArray(tags) ? tags.find((t: any) => t.name === "wo_id")?.value : tags.wo_id;
  const woNum = /WO\s?([\w-]+)/i.exec(subject)?.[1];

  const admin = createAdminClient();
  const reason = d.bounce?.message || d.bounce?.type || d.failed?.reason || "";
  await recordAlert(admin, {
    kind: "email_bounce",
    title: `Email to ${to} ${label[type]}`,
    body:
      (woNum ? `Work order ${woNum}: ` : subject ? `"${subject}": ` : "") +
      "they did not receive it. Check the email address" +
      (woId ? " on the Subcontractors page and click Re-email contractor." : ".") +
      (reason ? ` (${reason})` : ""),
    path: woId ? `/dashboard/work-orders/${woId}` : null,
    dedupeKey: `email-bounce:${d.email_id || id}`,
  });
  return NextResponse.json({ ok: true });
}
