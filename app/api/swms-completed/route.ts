import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailHtml, sendEmail, siteUrl } from "@/lib/email";

// Called by the SWMS form whenever a SWMS is saved as Completed. Sends the
// "inspection due" email once per SWMS (swms.inspection_notified_at) to the
// addresses set on the Settings page. Safe to call repeatedly — it does
// nothing unless this SWMS is Completed and hasn't been emailed about yet.
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
    .select("id, swms_number, status, archived, inspection_notified_at, work_order_id, site_address, suburb, builder_name, job_type, installers")
    .eq("id", swmsId)
    .single();
  if (!swms || swms.status !== "Completed" || swms.archived || swms.inspection_notified_at) {
    return NextResponse.json({ ok: true, sent: false });
  }

  // Claim it first so a double save can't send two emails.
  const { data: claimed } = await admin
    .from("swms")
    .update({ inspection_notified_at: new Date().toISOString() })
    .eq("id", swms.id)
    .is("inspection_notified_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, sent: false });

  let woNumber: string | null = null;
  let address = [swms.site_address, swms.suburb].filter(Boolean).join(", ");
  let builder = swms.builder_name || "";
  if (swms.work_order_id) {
    const { data: wo } = await admin
      .from("work_orders")
      .select("wo_number, projects(address, suburb, customers(name))")
      .eq("id", swms.work_order_id)
      .single();
    if (wo) {
      woNumber = wo.wo_number;
      const p = (wo as any).projects;
      if (!address && p) address = [p.address, p.suburb].filter(Boolean).join(", ");
      if (!builder) builder = p?.customers?.name || "";
    }
  }

  const { data: settings } = await admin.from("company_settings").select("inspection_notify_emails").eq("id", true).single();
  const recipients = String(settings?.inspection_notify_emails || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
  if (recipients.length === 0) recipients.push(process.env.OWNER_NOTIFY_EMAIL || "peterjk189@gmail.com");

  const installers = Array.isArray(swms.installers)
    ? (swms.installers as { name?: string }[]).map((i) => i?.name).filter(Boolean).join(", ")
    : "";
  const link = swms.work_order_id
    ? `${siteUrl()}/dashboard/inspections/new?work_order_id=${swms.work_order_id}`
    : `${siteUrl()}/dashboard/inspections`;
  const where = address || builder || `SWMS${swms.swms_number}`;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const result = await sendEmail({
    to: recipients,
    subject: `Inspection due — ${where}`,
    html: brandedEmailHtml({
      previewText: `SWMS${swms.swms_number} is in for ${where}. Time to inspect.`,
      heading: "Inspection due",
      bodyHtml: `
        <p style="margin:0 0 12px;">The installer has completed the SWMS for this job, so it's ready to inspect.</p>
        <table style="font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:2px 12px 2px 0;color:#888;">Site</td><td><strong>${esc(where)}</strong></td></tr>
          ${builder ? `<tr><td style="padding:2px 12px 2px 0;color:#888;">Builder</td><td>${esc(builder)}</td></tr>` : ""}
          ${woNumber ? `<tr><td style="padding:2px 12px 2px 0;color:#888;">Work order</td><td>${esc(woNumber)}</td></tr>` : ""}
          <tr><td style="padding:2px 12px 2px 0;color:#888;">SWMS</td><td>SWMS${swms.swms_number}${swms.job_type ? ` — ${esc(swms.job_type)}` : ""}</td></tr>
          ${installers ? `<tr><td style="padding:2px 12px 2px 0;color:#888;">Installer</td><td>${esc(installers)}</td></tr>` : ""}
        </table>`,
      buttonText: "Start inspection",
      buttonUrl: link,
    }),
  });

  if (!result.ok) {
    // Un-claim so the next save can try again once email is working.
    await admin.from("swms").update({ inspection_notified_at: null }).eq("id", swms.id);
    return NextResponse.json({ ok: false, sent: false, error: result.error });
  }
  return NextResponse.json({ ok: true, sent: true });
}
