import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailHtml, sendEmail, siteUrl } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Called by the inspection form when an inspection is booked for someone (or handed to someone new).
// Push first, email as a fallback. Never alerts someone about an inspection they assigned to themselves.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.inspection_id === "string" ? body.inspection_id : "";
  if (!id) return NextResponse.json({ error: "Missing inspection_id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: visible } = await supabase.from("inspections").select("id").eq("id", id).single();
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: ins } = await admin
    .from("inspections")
    .select("id, inspection_number, inspection_date, inspection_time, status, site_address, suburb, builder_name, assigned_to, archived")
    .eq("id", id)
    .single();
  if (!ins) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ins.assigned_to) return NextResponse.json({ ok: true, sent: false, reason: "No one assigned" });
  if (ins.assigned_to === user.id) return NextResponse.json({ ok: true, sent: false, reason: "Assigned to yourself" });
  if (ins.archived) return NextResponse.json({ ok: true, sent: false, reason: "Archived" });

  const site = [ins.site_address, ins.suburb].filter(Boolean).join(", ");
  const when = ins.inspection_date
    ? new Date(`${ins.inspection_date}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
    : "";
  const time = ins.inspection_time ? ` ${String(ins.inspection_time).slice(0, 5)}` : "";
  const label = `INS${ins.inspection_number}`;

  const pushed = await sendPushToUser(admin, ins.assigned_to, {
    title: `Inspection booked for you — ${when}${time}`,
    body: [ins.builder_name, site].filter(Boolean).join(" · ") || label,
    url: `/dashboard/inspections/${ins.id}`,
    tag: `inspection-${ins.id}`,
  });
  if (pushed > 0) return NextResponse.json({ ok: true, sent: true, via: "push", devices: pushed });

  const [{ data: target }, { data: targetProfile }, { data: byProfile }] = await Promise.all([
    admin.auth.admin.getUserById(ins.assigned_to),
    admin.from("profiles").select("full_name").eq("id", ins.assigned_to).single(),
    admin.from("profiles").select("full_name").eq("id", user.id).single(),
  ]);
  const to = target?.user?.email;
  if (!to) return NextResponse.json({ ok: false, sent: false, error: "That person has no email address" });
  const first = (targetProfile?.full_name || "").split(" ")[0] || "there";
  const rows: [string, string][] = [
    ["When", `${when}${time}`],
    ["Builder", ins.builder_name || "—"],
    ["Site", site || "—"],
  ];
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#8a8a8a;">${k}</td><td style="padding:4px 0;color:#111418;">${esc(String(v))}</td></tr>`)
    .join("");
  const r = await sendEmail({
    to,
    subject: `Inspection ${label} booked for you — ${when}${site ? ", " + site : ""}`,
    html: brandedEmailHtml({
      previewText: `${when}${time} · ${site}`,
      heading: `Hi ${esc(first)}, an inspection has been booked for you`,
      bodyHtml: `<p style="margin:0 0 12px;">${esc(byProfile?.full_name || "Someone")} booked inspection ${label} for you.</p><table style="font-size:14px;border-collapse:collapse;">${table}</table>`,
      buttonText: "Open inspection",
      buttonUrl: `${siteUrl()}/dashboard/inspections/${ins.id}`,
    }),
  });
  if (!r.ok) return NextResponse.json({ ok: false, sent: false, error: r.error });
  return NextResponse.json({ ok: true, sent: true, via: "email" });
}
