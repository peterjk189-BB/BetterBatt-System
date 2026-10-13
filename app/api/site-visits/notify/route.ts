import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailHtml, sendEmail, siteUrl } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Called by the site visit form when a visit is booked for someone (or handed to someone new).
// Emails the person the visit is assigned to. Never emails someone about a visit they assigned to
// themselves.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const visitId = typeof body.visit_id === "string" ? body.visit_id : "";
  if (!visitId) return NextResponse.json({ error: "Missing visit_id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // The caller must be allowed to see this visit.
  const { data: visible } = await supabase.from("site_visits").select("id").eq("id", visitId).single();
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: v } = await admin
    .from("site_visits")
    .select("id, visit_number, visit_date, visit_time, visit_type, status, customer_name, phone, address, suburb, notes, assigned_to")
    .eq("id", visitId)
    .single();
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The visit has been done (status set to Visited and saved): tell the office team (and admins),
  // except the person who just saved it.
  if (body.event === "visited") {
    if (v.status !== "Visited") return NextResponse.json({ ok: true, sent: false, reason: "Not marked Visited" });
    const [{ data: team }, { data: byProfile }] = await Promise.all([
      admin.from("profiles").select("id, full_name, role").in("role", ["office", "admin"]),
      admin.from("profiles").select("full_name").eq("id", user.id).single(),
    ]);
    const who = byProfile?.full_name || "Someone";
    const siteText = [v.address, v.suburb].filter(Boolean).join(", ");
    const summary = [v.customer_name, siteText].filter(Boolean).join(" · ") || `SV${v.visit_number}`;
    const link = `${siteUrl()}/dashboard/site-visits/${v.id}`;
    let pushedCount = 0;
    let emailed = 0;
    for (const m of (team ?? []) as { id: string; full_name: string | null }[]) {
      if (m.id === user.id) continue;
      const n = await sendPushToUser(admin, m.id, {
        title: `Site visit done — SV${v.visit_number}`,
        body: `${who} finished: ${summary}`,
        url: `/dashboard/site-visits/${v.id}`,
        tag: `site-visit-done-${v.id}`,
      });
      if (n > 0) {
        pushedCount += 1;
        continue;
      }
      // No device with notifications on: fall back to an email.
      const { data: target } = await admin.auth.admin.getUserById(m.id);
      const to = target?.user?.email;
      if (!to) continue;
      const r = await sendEmail({
        to,
        subject: `Site visit SV${v.visit_number} completed — ${summary}`,
        html: brandedEmailHtml({
          previewText: `${who} finished the site visit`,
          heading: `Site visit SV${v.visit_number} completed`,
          bodyHtml: `<p style="margin:0 0 8px;">${esc(who)} has marked this site visit as visited.</p><p style="margin:0;">${esc(summary)}</p>`,
          buttonText: "Open site visit",
          buttonUrl: link,
        }),
      });
      if (r.ok) emailed += 1;
    }
    return NextResponse.json({ ok: true, sent: pushedCount + emailed > 0, pushed: pushedCount, emailed });
  }

  if (!v.assigned_to) return NextResponse.json({ ok: true, sent: false, reason: "No one assigned" });
  if (v.assigned_to === user.id) return NextResponse.json({ ok: true, sent: false, reason: "Assigned to yourself" });
  if (v.status === "Cancelled") return NextResponse.json({ ok: true, sent: false, reason: "Cancelled" });

  // Push notification first (instant, on their phone/iPad). If they haven't switched notifications on
  // for any device yet, fall back to an email so they still find out.
  const siteLine = [v.address, v.suburb].filter(Boolean).join(", ");
  const whenLine = new Date(`${v.visit_date}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const pushed = await sendPushToUser(admin, v.assigned_to, {
    title: `Site visit booked for you — ${whenLine}${v.visit_time ? " " + String(v.visit_time).slice(0, 5) : ""}`,
    body: [v.customer_name, siteLine].filter(Boolean).join(" · ") || `SV${v.visit_number}`,
    url: `/dashboard/site-visits/${v.id}`,
    tag: `site-visit-${v.id}`,
  });
  if (pushed > 0) return NextResponse.json({ ok: true, sent: true, via: "push", devices: pushed });

  const [{ data: target }, { data: targetProfile }, { data: byProfile }] = await Promise.all([
    admin.auth.admin.getUserById(v.assigned_to),
    admin.from("profiles").select("full_name").eq("id", v.assigned_to).single(),
    admin.from("profiles").select("full_name").eq("id", user.id).single(),
  ]);
  const to = target?.user?.email;
  if (!to) return NextResponse.json({ ok: false, sent: false, error: "That person has no email address" });

  const first = (targetProfile?.full_name || "").split(" ")[0] || "there";
  const when = new Date(`${v.visit_date}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  const time = v.visit_time ? ` at ${String(v.visit_time).slice(0, 5)}` : "";
  const site = [v.address, v.suburb].filter(Boolean).join(", ");
  const rows: [string, string][] = [
    ["When", `${when}${time}`],
    ["Customer", v.customer_name || "—"],
    ["Address", site || "—"],
    ["Type", v.visit_type || "—"],
  ];
  if (v.phone) rows.push(["Phone", v.phone]);
  if (v.notes) rows.push(["Notes", v.notes]);
  const table = rows
    .map(([k, val]) => `<tr><td style="padding:4px 14px 4px 0;color:#8a8a8a;vertical-align:top;">${k}</td><td style="padding:4px 0;color:#111418;">${esc(String(val)).replace(/\n/g, "<br />")}</td></tr>`)
    .join("");

  const result = await sendEmail({
    to,
    subject: `Site visit SV${v.visit_number} booked for you — ${when}${site ? ", " + site : ""}`,
    html: brandedEmailHtml({
      previewText: `${when}${time} · ${site || v.customer_name || ""}`,
      heading: `Hi ${esc(first)}, a site visit has been booked for you`,
      bodyHtml: `<p style="margin:0 0 12px;">${esc(byProfile?.full_name || "Someone")} booked site visit SV${v.visit_number} for you.</p><table style="font-size:14px;border-collapse:collapse;">${table}</table>`,
      buttonText: "Open site visit",
      buttonUrl: `${siteUrl()}/dashboard/site-visits/${v.id}`,
    }),
  });
  if (!result.ok) return NextResponse.json({ ok: false, sent: false, error: result.error });
  return NextResponse.json({ ok: true, sent: true, via: "email" });
}
