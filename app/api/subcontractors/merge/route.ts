import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Admin only. Merges a duplicate subcontractor ("remove") into the one to keep:
 * every record pointing at the duplicate is moved onto the kept contractor, any blank
 * details on the kept contractor are filled in from the duplicate, then the duplicate is archived.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { keepId, removeId } = await req.json().catch(() => ({}));
  if (!keepId || !removeId || keepId === removeId) return NextResponse.json({ error: "Pick two different contractors" }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: keep }, { data: dup }] = await Promise.all([
    admin.from("subcontractors").select("*").eq("id", keepId).single(),
    admin.from("subcontractors").select("*").eq("id", removeId).single(),
  ]);
  if (!keep || !dup) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });

  const moved: Record<string, number> = {};
  const errors: string[] = [];
  const move = async (table: string, col: string) => {
    const { data, error } = await admin.from(table).update({ [col]: keepId }).eq(col, removeId).select("id");
    if (error) {
      // Table or column not present in this database (a migration not run) is fine; anything else is reported.
      if (!/does not exist|schema cache|Could not find/i.test(error.message)) errors.push(`${table}: ${error.message}`);
      return;
    }
    moved[table] = (data ?? []).length;
  };

  // Contractor invoices are numbered per contractor (unique per sub + seq), so renumber after the kept contractor's last one.
  try {
    const { data: keepInv } = await admin.from("contractor_invoices").select("seq").eq("subcontractor_id", keepId).order("seq", { ascending: false }).limit(1);
    const { data: dupInv } = await admin.from("contractor_invoices").select("id, seq").eq("subcontractor_id", removeId).order("seq");
    let next = ((keepInv ?? [])[0] as any)?.seq ?? 0;
    for (const r of (dupInv ?? []) as any[]) {
      next += 1;
      await admin.from("contractor_invoices").update({ subcontractor_id: keepId, seq: next }).eq("id", r.id);
    }
    moved.contractor_invoices = (dupInv ?? []).length;
  } catch {
    /* table not present */
  }

  await move("work_orders", "contractor_id");
  await move("work_order_lines", "subcontractor_id");
  await move("work_order_extras", "subcontractor_id");
  await move("time_away", "subcontractor_id");
  await move("subcontractor_workers", "subcontractor_id");
  await move("attachments", "subcontractor_id");
  await move("subcontractor_invites", "subcontractor_id");
  await move("profiles", "subcontractor_id");

  // Fill blanks on the kept contractor from the duplicate (onboarding details, insurance, banking, login link).
  const skip = new Set(["id", "created_at", "updated_at", "archived", "active", "name"]);
  const fill: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dup as Record<string, unknown>)) {
    if (skip.has(k) || v === null || v === undefined || v === "") continue;
    const cur = (keep as Record<string, unknown>)[k];
    if (cur === null || cur === undefined || cur === "" || cur === false) fill[k] = v;
  }
  // The login link can only point at one contractor: release it from the duplicate first.
  if (fill.linked_user_id) await admin.from("subcontractors").update({ linked_user_id: null }).eq("id", removeId);
  if (Object.keys(fill).length) {
    const { error } = await admin.from("subcontractors").update(fill).eq("id", keepId);
    if (error) errors.push(`details: ${error.message}`);
  }

  const { error: archErr } = await admin
    .from("subcontractors")
    .update({ archived: true, active: false, name: `${(dup as any).name} (merged into ${(keep as any).name})` })
    .eq("id", removeId);
  if (archErr) errors.push(`archive: ${archErr.message}`);

  return NextResponse.json({ ok: errors.length === 0, moved, filled: Object.keys(fill), errors });
}
