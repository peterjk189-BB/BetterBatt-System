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
  if (id === caller.id) {
    return NextResponse.json({ error: "You can't remove your own account" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Deleting the auth user cascades to the profiles row (profiles.id references
  // auth.users(id) on delete cascade).
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
