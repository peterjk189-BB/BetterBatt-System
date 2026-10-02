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
  const id = body.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: "User id is required" }, { status: 400 });
  }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const password = typeof body.password === "string" ? body.password : undefined;

  if (password && password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (email === "") {
    return NextResponse.json({ error: "Email can't be empty" }, { status: 400 });
  }

  const admin = createAdminClient();

  const authUpdate: { email?: string; password?: string; user_metadata?: { full_name: string } } = {};
  if (email) authUpdate.email = email;
  if (password) authUpdate.password = password;
  if (fullName !== undefined) authUpdate.user_metadata = { full_name: fullName };

  if (Object.keys(authUpdate).length > 0) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
  }

  if (fullName !== undefined) {
    const { error: profileError } = await admin.from("profiles").update({ full_name: fullName || null }).eq("id", id);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, email: email || undefined });
}
