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
  const termsAndConditions = typeof body.terms_and_conditions === "string" ? body.terms_and_conditions : undefined;
  if (termsAndConditions === undefined) {
    return NextResponse.json({ error: "terms_and_conditions is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("company_settings")
    .update({ terms_and_conditions: termsAndConditions, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
