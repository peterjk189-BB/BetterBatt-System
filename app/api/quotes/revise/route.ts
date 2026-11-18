import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { quoteLabel } from "@/lib/quoteLabel";

export const runtime = "nodejs";

// Fields that must not be copied into a revision (they belong to the sent/accepted original).
const STRIP = [
  "id", "share_token", "created_at", "updated_at", "emailed_at", "emailed_to", "accepted_at", "accepted_name", "accepted_ip",
  "first_viewed_at", "last_viewed_at", "view_count", "revision_of", "revision_letter", "outcome", "option_accepted", "archived",
];

/** Office/admin: copy a quote into the next revision (Q1125 -> Q1125-A -> Q1125-B) and mark the earlier version Superseded. */
export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing quote" }, { status: 400 });

  const admin = createAdminClient();
  const { data: src } = await admin.from("projects").select("*").eq("id", id).single();
  if (!src) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (src.outcome === "Superseded") return NextResponse.json({ error: "This version has already been replaced. Revise the latest version instead." }, { status: 400 });
  if (!("revision_letter" in src)) return NextResponse.json({ error: "Run migration 0098 in Supabase first." }, { status: 400 });

  const rootId = src.revision_of || src.id;
  const { data: sibs } = await admin.from("projects").select("revision_letter").eq("quote_number", src.quote_number);
  const maxCode = ((sibs ?? []) as any[]).reduce((m, r) => (r.revision_letter ? Math.max(m, String(r.revision_letter).charCodeAt(0)) : m), 64);
  if (maxCode >= 90) return NextResponse.json({ error: "Too many revisions (A to Z used)." }, { status: 400 });
  const letter = String.fromCharCode(maxCode + 1);

  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) if (!STRIP.includes(k)) copy[k] = v;
  copy.revision_of = rootId;
  copy.revision_letter = letter;
  copy.outcome = "Open";
  copy.archived = false;
  copy.entry_date = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  if ("option_accepted" in src) copy.option_accepted = [];

  const { data: created, error } = await admin.from("projects").insert(copy).select("id").single();
  if (error || !created) {
    const msg = /quote_number|duplicate|unique/i.test(error?.message || "") ? "Run migration 0098 in Supabase first." : error?.message || "Could not create the revision";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data: lines } = await admin.from("project_lines").select("*").eq("project_id", src.id).order("sort_order");
  if ((lines ?? []).length > 0) {
    const rows = (lines as any[]).map(({ id: _id, project_id: _p, ...rest }) => ({ ...rest, project_id: created.id }));
    const { error: le } = await admin.from("project_lines").insert(rows);
    if (le) {
      await admin.from("projects").delete().eq("id", created.id);
      return NextResponse.json({ error: `Could not copy the quote lines: ${le.message}` }, { status: 400 });
    }
  }

  // The version we revised is replaced (unless it never reached the customer, in which case it is still superseded: only the latest counts).
  await admin.from("projects").update({ outcome: "Superseded" }).eq("id", src.id);

  return NextResponse.json({ ok: true, id: created.id, label: quoteLabel({ quote_number: src.quote_number, revision_letter: letter }) });
}
