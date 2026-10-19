import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, siteUrl } from "@/lib/email";

// Public endpoint — no login. Anyone with the quote's share_token (an
// unguessable UUID) can accept it. Looked up only by that token, never by
// sequential id, so this doesn't expose any other quote.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : undefined;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const pickedOptions: string[] = Array.isArray(body.options) ? body.options.filter((o: unknown) => typeof o === "string") : [];

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: project, error: findError } = await admin
    .from("projects")
    .select("id, quote_number, accepted_at")
    .eq("share_token", token)
    .single();

  if (findError || !project) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  if (project.accepted_at) {
    // Already accepted — treat as a no-op success rather than an error, so a
    // double-tap on a slow connection doesn't show a scary message.
    return NextResponse.json({ ok: true, already: true, accepted_at: project.accepted_at });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
  const acceptedAt = new Date().toISOString();

  // Only keep options that really exist on this quote (lines carry the option key).
  let validOptions: string[] = [];
  if (pickedOptions.length > 0) {
    const { data: optLines } = await admin.from("project_lines").select("option_key").eq("project_id", project.id);
    const real = new Set((optLines ?? []).map((l: any) => l.option_key).filter(Boolean));
    validOptions = pickedOptions.filter((o) => real.has(o));
  }

  const { error: updateError } = await admin
    .from("projects")
    .update({
      accepted_at: acceptedAt,
      accepted_name: name,
      accepted_ip: ip,
      outcome: "Accepted",
      ...(validOptions.length > 0 ? { option_accepted: validOptions } : {}),
    })
    .eq("id", project.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await admin.from("audit_log").insert({
    user_id: null,
    user_name: `${name} (customer)`,
    event_type: "update",
    entity_type: "quote",
    entity_id: project.id,
    entity_label: `Q${project.quote_number}`,
    details: `Accepted online via customer link${validOptions.length ? ` (with option${validOptions.length > 1 ? "s" : ""} ${validOptions.join(", ")})` : ""}`,
  });

  // Best-effort: let the office know a quote was just signed. Never block
  // the customer's acceptance on this — if email isn't set up yet, or
  // Resend rejects it (e.g. still in test mode), the acceptance itself has
  // already been saved above.
  const notifyEmail = process.env.OWNER_NOTIFY_EMAIL || "peterjk189@gmail.com";
  const quoteLink = `${siteUrl()}/dashboard/quotes/${project.id}`;
  await sendEmail({
    to: notifyEmail,
    subject: `Quote Q${project.quote_number} was just accepted`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 4px;">Q${project.quote_number} accepted ✅</h2>
        <p style="color: #555;">
          ${name} just accepted this quote online${validOptions.length ? ` with option${validOptions.length > 1 ? "s" : ""} ${validOptions.join(", ")}` : ""} at ${new Date(acceptedAt).toLocaleString("en-AU")}.
        </p>
        <p style="margin: 24px 0;">
          <a href="${quoteLink}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
            Open quote in Better Batt System
          </a>
        </p>
      </div>
    `,
  });

  return NextResponse.json({ ok: true, already: false, accepted_at: acceptedAt });
}
