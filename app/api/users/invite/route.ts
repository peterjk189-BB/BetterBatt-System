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
  const role = body.role === "admin" ? "admin" : "installer";
  const subcontractorId = body.subcontractor_id || null;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
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
