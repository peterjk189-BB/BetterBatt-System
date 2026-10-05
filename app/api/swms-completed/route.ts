import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextInspectionDate, prefillFromWorkOrder, prefillToRow } from "@/lib/inspectionPrefill";

// Called by the SWMS form whenever a SWMS is saved as Completed. Books the
// inspection for that work order onto the Calendar: a 'Scheduled'
// inspection dated the next weekday, filled in from the work order and
// SWMS. Happens once per SWMS (swms.inspection_notified_at), and never if
// the work order already has an inspection. Safe to call repeatedly.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const swmsId = typeof body.swms_id === "string" ? body.swms_id : undefined;
  if (!swmsId) return NextResponse.json({ error: "Missing swms_id" }, { status: 400 });

  // The caller must be signed in and allowed to see this SWMS.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: visible } = await supabase.from("swms").select("id").eq("id", swmsId).single();
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: swms } = await admin
    .from("swms")
    .select("id, status, archived, inspection_notified_at, work_order_id")
    .eq("id", swmsId)
    .single();
  if (!swms || swms.status !== "Completed" || swms.archived || swms.inspection_notified_at || !swms.work_order_id) {
    return NextResponse.json({ ok: true, scheduled: false });
  }

  // Claim it first so a double save can't book two inspections.
  const { data: claimed } = await admin
    .from("swms")
    .update({ inspection_notified_at: new Date().toISOString() })
    .eq("id", swms.id)
    .is("inspection_notified_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, scheduled: false });

  const { data: existing } = await admin
    .from("inspections")
    .select("id")
    .eq("work_order_id", swms.work_order_id)
    .eq("archived", false)
    .limit(1);
  if (existing && existing.length > 0) return NextResponse.json({ ok: true, scheduled: false });

  const prefill = await prefillFromWorkOrder(admin, swms.work_order_id);
  if (!prefill) {
    await admin.from("swms").update({ inspection_notified_at: null }).eq("id", swms.id);
    return NextResponse.json({ ok: false, scheduled: false, error: "Work order not found" });
  }

  const date = nextInspectionDate();
  const { data: inserted, error } = await admin
    .from("inspections")
    .insert({ ...prefillToRow(prefill), status: "Scheduled", inspection_date: date, created_by: user.id })
    .select("id, inspection_number")
    .single();
  if (error || !inserted) {
    // Un-claim so the next save can try again.
    await admin.from("swms").update({ inspection_notified_at: null }).eq("id", swms.id);
    return NextResponse.json({ ok: false, scheduled: false, error: error?.message || "Could not book the inspection" });
  }

  await admin.from("audit_log").insert({
    user_id: user.id,
    user_name: "Auto-booked (SWMS completed)",
    event_type: "create",
    entity_type: "Inspection",
    entity_id: inserted.id,
    entity_label: `INS${inserted.inspection_number}${prefill.site_address ? " — " + prefill.site_address : ""}`,
    details: `Booked for ${date} when the SWMS was completed`,
  });

  return NextResponse.json({ ok: true, scheduled: true, inspection_id: inserted.id, date });
}
