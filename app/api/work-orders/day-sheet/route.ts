import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDaySheetPdf, loadDaySheet, longDate } from "@/lib/daySheet";
import { brandedEmailHtml, sendEmail, siteUrl } from "@/lib/email";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const fileName = (name: string, date: string) => `${date.split("-").reverse().join("-")} Day sheet - ${name}.pdf`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const splitEmails = (v: unknown) =>
  (typeof v === "string" ? v : "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** The contractor's own email plus any app users linked to them. */
async function defaultRecipients(subId: string, subEmail: string) {
  const admin = createAdminClient();
  const out = new Set<string>();
  if (subEmail.trim()) out.add(subEmail.trim().toLowerCase());
  const { data: people } = await admin.from("profiles").select("id").eq("subcontractor_id", subId);
  for (const p of (people ?? []) as { id: string }[]) {
    const { data: t } = await admin.auth.admin.getUserById(p.id);
    const e = t?.user?.email;
    if (e) out.add(e.toLowerCase());
  }
  return Array.from(out);
}

/**
 * GET ?sub=<id>&date=YYYY-MM-DD            -> JSON summary (jobs, who it will go to, jobs held back)
 * GET ?sub=<id>&date=YYYY-MM-DD&pdf=1      -> the combined PDF itself (download / preview)
 */
export async function GET(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const sub = sp.get("sub") || "";
  const date = sp.get("date") || "";
  if (!sub || !DATE_RE.test(date)) return NextResponse.json({ error: "Pick a contractor and a date" }, { status: 400 });
  const ds = await loadDaySheet(ctx.supabase, sub, date);
  if (!ds) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });

  if (sp.get("pdf") === "1") {
    const bytes = await buildDaySheetPdf(ds);
    const name = fileName(ds.contractorName, date);
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"` },
    });
  }
  const to = await defaultRecipients(sub, ds.contractorEmail);
  return NextResponse.json({
    contractor: ds.contractorName,
    to,
    jobs: ds.jobs.map((j) => ({ wo: j.woNumber, site: j.site, customer: j.customer, m2: Math.round(j.m2 * 10) / 10 })),
    heldBack: ds.heldBack,
  });
}

/** POST { sub, date, to?, message?, copyMe? } -> emails the combined PDF. */
export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const sub = String(body.sub || "");
  const date = String(body.date || "");
  if (!sub || !DATE_RE.test(date)) return NextResponse.json({ error: "Pick a contractor and a date" }, { status: 400 });
  const ds = await loadDaySheet(ctx.supabase, sub, date);
  if (!ds) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
  if (ds.jobs.length === 0) return NextResponse.json({ error: "There are no authorised jobs for that contractor on that date." }, { status: 400 });

  const to = splitEmails(body.to);
  if (to.length === 0 || !to.every((e) => EMAIL_RE.test(e))) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }
  const copyMe = body.copyMe !== false && !!ctx.user.email;
  const recipients = Array.from(new Set([...to, ...(copyMe ? [ctx.user.email as string] : [])].map((e) => e.toLowerCase())));
  const bytes = await buildDaySheetPdf(ds);
  const when = longDate(date);
  const note = typeof body.message === "string" ? body.message.trim() : "";
  const first = (ds.contractorName.split(" ")[0] || "there").trim();
  const list = ds.jobs
    .map((j) => `<li><b>${esc(j.woNumber)}</b> — ${esc(j.site || "No address")}${j.customer ? ` (${esc(j.customer)})` : ""}</li>`)
    .join("");

  const res = await sendEmail({
    kind: "jobs",
    to: recipients,
    subject: `Your jobs for ${when} — ${ds.jobs.length} job${ds.jobs.length === 1 ? "" : "s"}`,
    html: brandedEmailHtml({
      previewText: `${ds.jobs.length} job${ds.jobs.length === 1 ? "" : "s"} on ${when}`,
      heading: `Hi ${esc(first)}, here are your jobs for ${esc(when)}`,
      bodyHtml: `<p style="margin:0 0 8px;">All of the day's jobs are on the one attached PDF.</p><ul style="margin:0 0 8px;padding-left:18px;">${list}</ul>${note ? `<p style="margin:8px 0 0;">${esc(note).replace(/\n/g, "<br/>")}</p>` : ""}`,
      buttonText: "Open job schedule",
      buttonUrl: `${siteUrl()}/dashboard/calendar`,
    }),
    attachments: [{ filename: fileName(ds.contractorName, date), content: Buffer.from(bytes).toString("base64") }],
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, to: recipients, jobs: ds.jobs.length });
}
