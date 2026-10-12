import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailHtml, sendEmail, siteUrl } from "@/lib/email";

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
  if (!v || !v.assigned_to) return NextResponse.json({ ok: true, sent: false, reason: "No one assigned" });
  if (v.assigned_to === user.id) return NextResponse.json({ ok: true, sent: false, reason: "Assigned to yourself" });
  if (v.status === "Cancelled") return NextResponse.json({ ok: true, sent: false, reason: "Cancelled" });

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
  return NextResponse.json({ ok: true, sent: true });
}
