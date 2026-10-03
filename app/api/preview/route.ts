import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_COOKIE } from "@/lib/preview";

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
  const userId = typeof body.user_id === "string" ? body.user_id : null;
  const sampleRole = typeof body.sample_role === "string" ? body.sample_role : null;

  let cookieValue: string;
  if (sampleRole) {
    if (!["office", "installer"].includes(sampleRole)) {
      return NextResponse.json({ error: "Invalid sample role" }, { status: 400 });
    }
    cookieValue = `role:${sampleRole}`;
  } else if (userId) {
    cookieValue = userId;
  } else {
    return NextResponse.json({ error: "user_id or sample_role is required" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PREVIEW_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });
  return res;
}

export async function DELETE() {
  const caller = await requireAdmin();
  if (!caller) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PREVIEW_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
