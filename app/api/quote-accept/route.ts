import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Public endpoint — no login. Anyone with the quote's share_token (an
// unguessable UUID) can accept it. Looked up only by that token, never by
// sequential id, so this doesn't expose any other quote.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : undefined;
  const name = typeof body.name === "string" ? body.name.trim() : "";

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

  const { error: updateError } = await admin
    .from("projects")
    .update({ accepted_at: acceptedAt, accepted_name: name, accepted_ip: ip, outcome: "Accepted" })
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
    details: "Accepted online via customer link",
  });

  return NextResponse.json({ ok: true, already: false, accepted_at: acceptedAt });
}
