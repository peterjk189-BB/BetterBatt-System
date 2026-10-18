import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailHtml, sendEmail, siteUrl } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function niceDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// Called by the work order form after a save that scheduled new job dates for a contractor.
// Body: { work_order_id, items: [{ subcontractor_id, dates: ["YYYY-MM-DD", ...] }] }
// Pushes a "job scheduled" alert to every app user linked to that subcontractor (email fallback).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const woId = typeof body.work_order_id === "string" ? body.work_order_id : "";
  const items: { subcontractor_id: string; dates: string[] }[] = Array.isArray(body.items) ? body.items : [];
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
  const today = new Date().toISOString().slice(0, 10);
  const link = `${siteUrl()}/dashboard/work-orders/${woId}`;
  let pushed = 0;
  let emailed = 0;

  for (const it of items) {
    // Only dates that really are on this contractor's lines, and not in the past.
    const real = new Set(
      ((lines ?? []) as { subcontractor_id: string | null; task_date: string }[])
        .filter((l) => l.subcontractor_id === it.subcontractor_id)
        .map((l) => l.task_date)
    );
    const dates = Array.from(new Set((it.dates ?? []).filter((d) => real.has(d) && d >= today))).sort();
    if (dates.length === 0) continue;
    const { data: people } = await admin.from("profiles").select("id, full_name").eq("subcontractor_id", it.subcontractor_id);
    const dateText = dates.map(niceDate).join(", ");
    for (const person of (people ?? []) as { id: string; full_name: string | null }[]) {
      if (person.id === user.id) continue;
      const n = await sendPushToUser(admin, person.id, {
        title: `Job scheduled — WO ${wo.wo_number}`,
        body: [dateText, site].filter(Boolean).join(" · "),
        url: `/dashboard/work-orders/${woId}`,
        tag: `wo-${woId}-${it.subcontractor_id}`,
      });
      if (n > 0) {
        pushed += 1;
        continue;
      }
      const { data: target } = await admin.auth.admin.getUserById(person.id);
      const to = target?.user?.email;
      if (!to) continue;
      const first = (person.full_name || "").split(" ")[0] || "there";
      const r = await sendEmail({
        to,
        subject: `Job scheduled for you — WO ${wo.wo_number}, ${dateText}`,
        html: brandedEmailHtml({
          previewText: `${dateText}${site ? " · " + site : ""}`,
          heading: `Hi ${esc(first)}, a job has been scheduled for you`,
          bodyHtml: `<p style="margin:0 0 8px;">Work order ${esc(String(wo.wo_number))}</p><p style="margin:0 0 8px;">${esc(dateText)}</p><p style="margin:0;">${esc(site || "")}</p>`,
          buttonText: "Open work order",
          buttonUrl: link,
        }),
      });
      if (r.ok) emailed += 1;
    }
  }
  return NextResponse.json({ ok: true, sent: pushed + emailed > 0, pushed, emailed });
}
