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
  const update: Record<string, string | null> = {};
  if (typeof body.terms_and_conditions === "string") update.terms_and_conditions = body.terms_and_conditions;
  if (typeof body.subcontractor_agreement === "string") {
    update.subcontractor_agreement = body.subcontractor_agreement.trim() || null;
  }
  for (const key of ["abn", "company_phone", "invoice_bank_details", "invoice_footer", "qb_ar_account", "qb_income_account", "qb_gst_account"]) {
    if (typeof body[key] === "string") update[key] = body[key].trim() || null;
  }
  if (typeof body.inspection_notify_emails === "string") {
    update.inspection_notify_emails = body.inspection_notify_emails.trim() || null;
  }
  // Sales Report target (migration 0109). A number, ex GST.
  const extra: Record<string, number> = {};
  if (body.annual_sales_target !== undefined) {
    const n = Number(body.annual_sales_target);
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: "Enter a target above $0" }, { status: 400 });
    extra.annual_sales_target = Math.round(n);
  }
  if (Object.keys(update).length === 0 && Object.keys(extra).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("company_settings")
    .update({ ...update, ...extra, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
