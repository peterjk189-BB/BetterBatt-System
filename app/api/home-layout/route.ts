import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/invoiceServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_TABS } from "@/lib/tabs";
import { parseLayout } from "@/lib/homeLayout";

export const runtime = "nodejs";

/** Saves the signed-in office/admin user's own home layout. Only the fields sent are changed. */
export async function POST(req: Request) {
  const ctx = await requireStaff();
  if (!ctx) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const valid = new Set<string>(ALL_TABS.map((t) => t.key));
  const clean = (v: unknown) => (Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && valid.has(x)))).slice(0, 60) : null);

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin.from("profiles").select("home_layout").eq("id", ctx.user.id).single();
  if (readErr) return NextResponse.json({ error: readErr.message + " (has migration 0095 been run?)" }, { status: 500 });
  const cur = parseLayout((row as any)?.home_layout);
  const SECTIONS = new Set(["money", "actions", "today", "attention", "followups"]);
  const cleanSec = (v: unknown) => (Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && SECTIONS.has(x)))) : null);
  const next = {
    sections: cleanSec(body.sections) ?? cur.sections,
    hiddenSections: cleanSec(body.hiddenSections) ?? cur.hiddenSections,
    tiles: clean(body.tiles) ?? cur.tiles,
    hidden: clean(body.hidden) ?? cur.hidden,
    pins: clean(body.pins) ?? cur.pins,
  };
  const { error } = await admin.from("profiles").update({ home_layout: next }).eq("id", ctx.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, layout: next });
}
