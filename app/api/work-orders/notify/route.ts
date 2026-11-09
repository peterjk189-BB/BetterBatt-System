import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailSender } from "@/lib/emailSender";
import { brandedEmailHtml, sendEmail, siteUrl } from "@/lib/email";
import { buildDaySheetPdf, loadDaySheet } from "@/lib/daySheet";
import { todayAU } from "@/lib/dates";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function niceDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// Called by the work order form after a save that scheduled new job dates for a contractor.
// Body: { work_order_id, items: [{ subcontractor_id, dates: ["YYYY-MM-DD", ...] }] }
// Emails the contractor (and any app users linked to them) that a job is on their schedule. No push alerts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const woId = typeof body.work_order_id === "string" ? body.work_order_id : "";
  const items: { subcontractor_id: string; dates: string[] }[] = Array.isArray(body.items) ? body.items : [];
  const resend = body.resend === true;
  // Optional note from the office, shown at the top of the email.
  const officeMsg = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const msgHtml = officeMsg
    ? `<div style="margin:0 0 16px;padding:12px 14px;background:#fff7e0;border-left:4px solid #f5b400;border-radius:4px;color:#333;">${esc(officeMsg).replace(/\n/g, "<br />")}</div>`
    : "";
  if (!woId || items.length === 0) return NextResponse.json({ error: "Missing work_order_id or items" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: visible } = await supabase.from("work_orders").select("id").eq("id", woId).single();
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const [{ data: wo }, { data: lines }] = await Promise.all([
    admin
      .from("work_orders")
      .select("*, projects(address, suburb, lot_no)")
      .eq("id", woId)
      .single(),
    admin.from("work_order_lines").select("subcontractor_id, task_date").eq("work_order_id", woId).not("task_date", "is", null),
  ]);
  if (!wo || (wo as any).archived) return NextResponse.json({ ok: true, sent: false, reason: "Archived" });
  // Contractors are not alerted until the office authorises the work order (column from migration 0046).
  if ("authorised_at" in (wo as any) && !(wo as any).authorised_at) {
    return NextResponse.json({ ok: true, sent: false, reason: "Not authorised yet" });
  }

  const proj = (wo as any).projects;
  const p = Array.isArray(proj) ? proj[0] : proj;
  const site = [p?.lot_no ? `Lot ${p.lot_no}` : "", p?.address, p?.suburb].filter(Boolean).join(", ");
  const today = todayAU();
  const link = `${siteUrl()}/dashboard/calendar`;
  let emailed = 0;
  const sentTo: string[] = [];
  const noEmail: string[] = []; // contractors with nobody to email
  const failed: string[] = []; // addresses Resend refused outright

  for (const it of items) {
    // Only dates that really are on this contractor's lines, and not in the past.
    const real = new Set(
      ((lines ?? []) as { subcontractor_id: string | null; task_date: string }[])
        .filter((l) => l.subcontractor_id === it.subcontractor_id)
        .map((l) => l.task_date)
    );
    const dates = Array.from(new Set((it.dates ?? []).filter((d) => real.has(d) && d >= today))).sort();
    if (dates.length === 0) continue;
    // Email only (no push alerts): the contractor's own email on file, plus any app users linked to them.
    const [{ data: sub }, { data: people }] = await Promise.all([
      admin.from("subcontractors").select("name, email").eq("id", it.subcontractor_id).single(),
      admin.from("profiles").select("id, full_name").eq("subcontractor_id", it.subcontractor_id),
    ]);
    const dateText = dates.map(niceDate).join(", ");
    const recipients = new Map<string, string>(); // email -> first name
    const subEmail = ((sub as any)?.email || "").trim();
    if (subEmail) recipients.set(subEmail.toLowerCase(), (((sub as any)?.name || "").split(" ")[0] || "there"));
    for (const person of (people ?? []) as { id: string; full_name: string | null }[]) {
      const { data: target } = await admin.auth.admin.getUserById(person.id);
      const to = target?.user?.email;
      if (!to || recipients.has(to.toLowerCase())) continue;
      recipients.set(to.toLowerCase(), (person.full_name || "").split(" ")[0] || "there");
    }
    // A PDF day sheet per date (the contractor's jobs for that day, with products, quantities and notes), easier to read than the app.
    const attachments: { filename: string; content: string }[] = [];
    for (const d of dates.slice(0, 7)) {
      try {
        const ds = await loadDaySheet(admin, it.subcontractor_id, d);
        if (!ds) continue;
        const bytes = await buildDaySheetPdf(ds);
        attachments.push({
          filename: `${d.split("-").reverse().join("-")} Work sheet - ${(ds.contractorName || "Contractor").replace(/[^A-Za-z0-9 _.-]/g, "")}.pdf`,
          content: Buffer.from(bytes).toString("base64"),
        });
      } catch {
        // the email still goes out without the PDF
      }
    }
    if (recipients.size === 0) noEmail.push(((sub as any)?.name as string) || "a contractor");
    for (const [to, first] of Array.from(recipients.entries())) {
      const r = await sendEmail({
      kind: "jobs",
        sender: await getEmailSender(supabase, user),
        tags: [{ name: "wo_id", value: String(woId).replace(/[^A-Za-z0-9_-]/g, "") }, { name: "type", value: "work_order_job" }],
        to,
        subject: `${resend ? "Reminder: job" : "Job"} scheduled for you — WO ${wo.wo_number}, ${dateText}`,
        html: brandedEmailHtml({
          previewText: `${dateText}${site ? " · " + site : ""}`,
          heading: `Hi ${esc(first)}, a job has been scheduled for you`,
          bodyHtml: `${msgHtml}<p style="margin:0 0 8px;">Work order ${esc(String(wo.wo_number))}</p><p style="margin:0 0 8px;">${esc(dateText)}</p><p style="margin:0;">${esc(site || "")}</p><p style="margin:12px 0 0;">It is now on your job schedule.${attachments.length ? " The work sheet is attached as a PDF." : ""}</p>`,
          buttonText: "Open job schedule",
          buttonUrl: link,
        }),
        ...(attachments.length ? { attachments } : {}),
      });
      if (r.ok) {
        emailed += 1;
        sentTo.push(to);
      } else {
        failed.push(`${to} (${r.error})`);
      }
    }
  }
  return NextResponse.json({ ok: true, sent: emailed > 0, emailed, to: sentTo, noEmail, failed });
}
