import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return null;
  return user;
}

export async function POST(req: Request) {
  const caller = await requireAdmin();
  if (!caller) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();
  const email = (body.email || "").trim();
  const fullName = (body.full_name || "").trim();
  const role = ["admin", "office", "installer"].includes(body.role) ? body.role : "installer";
  const subcontractorId = body.subcontractor_id || null;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Without an explicit redirectTo, Supabase sends the invite link to the
  // project's "Site URL" in Auth settings — which defaults to localhost and
  // leaves the invited person stuck on "can't reach this page". Point it at
  // this deployment's set-password page instead.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000";

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl}/set-password`,
  });

  if (inviteError || !invited?.user) {
    return NextResponse.json({ error: inviteError?.message || "Failed to invite user" }, { status: 400 });
  }

  // The handle_new_user trigger creates a default profile row (role: installer,
  // no subcontractor link) — upsert here to apply the role/link chosen in the form.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: invited.user.id,
      full_name: fullName || null,
      role,
      subcontractor_id: subcontractorId,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: invited.user.id, email: invited.user.email });
}
