import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyQuoteAccepted } from "@/lib/notifyQuoteAccepted";

// Called by the quote editor when a staff member changes a quote's outcome to Accepted.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.project_id === "string" ? body.project_id : "";
  if (!id) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: proj } = await supabase.from("projects").select("id, quote_number, outcome").eq("id", id).single();
  if (!proj || (proj as any).outcome !== "Accepted") return NextResponse.json({ ok: false }, { status: 404 });
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  await notifyQuoteAccepted(createAdminClient(), {
    projectId: id,
    quoteNumber: (proj as any).quote_number,
    by: (me as any)?.full_name || user.email || "A staff member",
  });
  return NextResponse.json({ ok: true });
}
