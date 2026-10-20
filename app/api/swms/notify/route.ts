import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/notifyStaff";
import { siteUrl } from "@/lib/email";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Called by the SWMS form. Body: { swms_id, event: "started" | "completed" }.
// Alerts all admin and office users (email + app notification) once per event per SWMS, and stamps
// completed_at the first time a SWMS is Completed. Safe to call repeatedly.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const swmsId = typeof body.swms_id === "string" ? body.swms_id : "";
  const event = body.event === "completed" ? "completed" : body.event === "started" ? "started" : "";
  if (!swmsId || !event) return NextResponse.json({ error: "Missing swms_id or event" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: visible } = await supabase.from("swms").select("id").eq("id", swmsId).single();
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const col = event === "started" ? "start_notified_at" : "completed_notified_at";
  const nowIso = new Date().toISOString();

  // Claim first so a double call can't alert twice. If the 0048 columns don't exist yet this just no-ops.
  const { data: claimed, error: claimErr } = await admin
    .from("swms")
    .update({ [col]: nowIso, ...(event === "completed" ? { completed_at: nowIso } : {}) })
    .eq("id", swmsId)
    .is(col, null)
    .select("id, swms_number, status, archived, site_address, suburb, builder_name, start_lat, start_lng, start_accuracy_m, started_at, work_orders(wo_number)");
  if (claimErr || !claimed || claimed.length === 0) return NextResponse.json({ ok: true, sent: false });
  const s: any = claimed[0];
  if (s.archived || (event === "completed" && s.status !== "Completed")) {
    // Not actually complete: release the claim.
    await admin.from("swms").update({ [col]: null, ...(event === "completed" ? { completed_at: null } : {}) }).eq("id", swmsId);
    return NextResponse.json({ ok: true, sent: false });
  }

  const { data: me } = await admin.from("profiles").select("full_name").eq("id", user.id).single();
  const who = (me as any)?.full_name || user.email || "A contractor";
  const site = [s.site_address, s.suburb].filter(Boolean).join(", ");
  const wo = s.work_orders?.wo_number ? `WO ${s.work_orders.wo_number}` : "";
  const time = new Date(event === "started" ? s.started_at || nowIso : nowIso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  });
  const where = [wo, site].filter(Boolean).join(" · ");
  const hasLoc = typeof s.start_lat === "number" && typeof s.start_lng === "number";
  const mapUrl = hasLoc ? `https://www.google.com/maps?q=${s.start_lat},${s.start_lng}` : "";
  const link = `${siteUrl()}/dashboard/swms/${s.id}`;

  if (event === "started") {
    await notifyStaff(admin, {
      subject: `${who} has arrived and started SWMS${site ? " — " + site : ""}`,
      heading: `${esc(who)} has arrived and started their SWMS`,
      previewText: `${where} at ${time}`,
      bodyHtml: `<p style="margin:0 0 8px;">SWMS${s.swms_number} started at ${esc(time)}.</p>${where ? `<p style="margin:0 0 8px;">${esc(where)}</p>` : ""}${
        hasLoc
          ? `<p style="margin:0;">Location recorded${s.start_accuracy_m ? ` (±${Math.round(Number(s.start_accuracy_m))} m)` : ""}: <a href="${mapUrl}">view on map</a></p>`
          : `<p style="margin:0;color:#888;">No location recorded.</p>`
      }`,
      buttonText: "Open SWMS",
      url: link,
      path: `/dashboard/swms/${s.id}`,
      pushTitle: `${who} has started their SWMS`,
      pushBody: `${where || "SWMS" + s.swms_number} · ${time}`,
      tag: `swms-start-${s.id}`,
    });
  } else {
    await notifyStaff(admin, {
      subject: `SWMS completed by ${who}${site ? " — " + site : ""}`,
      heading: `${esc(who)} has completed their SWMS`,
      previewText: `${where} — cleared to start installing`,
      bodyHtml: `<p style="margin:0 0 8px;">SWMS${s.swms_number} completed at ${esc(time)}. Site hazards have been inspected and signed off, so work can start.</p>${where ? `<p style="margin:0;">${esc(where)}</p>` : ""}`,
      buttonText: "Open SWMS",
      url: link,
      path: `/dashboard/swms/${s.id}`,
      pushTitle: `SWMS completed — ${who}`,
      pushBody: `${where || "SWMS" + s.swms_number} · cleared to start installing`,
      tag: `swms-done-${s.id}`,
    });
  }
  return NextResponse.json({ ok: true, sent: true });
}
