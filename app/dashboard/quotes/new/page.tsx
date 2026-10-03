import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import { normaliseChecklist, num } from "@/lib/siteVisit";
import QuoteEditor, { type QuotePrefill } from "../QuoteEditor";

type PartLite = { id: string; name: string };

/** Best part for a site-visit product label, by shared words/numbers (e.g. "PolyFloor R2.5 450"). Null if nothing fits well. */
function matchPart(label: string, parts: PartLite[]): string | null {
  const tokens = label
    .toLowerCase()
    .split(/[\s/]+/)
    .map((t) => t.replace(/^r(?=\d)/, ""))
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return null;
  let best: { id: string; score: number } | null = null;
  for (const p of parts) {
    const name = p.name.toLowerCase();
    const score = tokens.filter((t) => name.includes(t)).length;
    if (!best || score > best.score) best = { id: p.id, score };
  }
  return best && best.score >= 2 ? best.id : null;
}

export default async function NewQuotePage({ searchParams }: { searchParams: { site_visit_id?: string } }) {
  const supabase = await createClient();
  const [{ data: customers }, { data: parts }, role] = await Promise.all([
    supabase.from("customers").select("*").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  let prefill: QuotePrefill | null = null;
  if (searchParams.site_visit_id) {
    const { data: v } = await supabase.from("site_visits").select("*").eq("id", searchParams.site_visit_id).single();
    if (v) {
      const c = normaliseChecklist(v.checklist);
      const linked = (customers ?? []).find((x) => x.id === v.customer_id);
      const product = c.underfloor_products[0] || "";
      const wanted: { label: string; qty: number }[] = [
        { label: `${c.ceiling_r_rating} 430`, qty: num(c.ceiling_430_m2) },
        { label: `${c.ceiling_r_rating} 580`, qty: num(c.ceiling_580_m2) },
        { label: product || "underfloor 415", qty: num(c.underfloor_415_m2) },
        { label: product ? `${product} 565` : "underfloor 565", qty: num(c.underfloor_565_m2) },
      ].filter((w) => w.qty > 0);

      prefill = {
        siteVisit: { id: v.id, visit_number: v.visit_number },
        customer_id: v.customer_id || "",
        customer_name: v.customer_name || "",
        category: linked?.category || (v.visit_type === "Retro fit" ? "Retro Fit" : ""),
        contact_name: v.customer_name || "",
        contact_phone: v.phone || "",
        contact_email: v.email || "",
        address: v.address || "",
        suburb: v.suburb || "",
        lines: wanted.map((w, i) => ({
          part_id: matchPart(w.label, (parts ?? []) as PartLite[]) || "",
          qty_m2: w.qty,
          note: null,
          sort_order: i,
        })),
      };
    }
  }

  return (
    <QuoteEditor
      project={null}
      lines={[]}
      customers={customers ?? []}
      parts={parts ?? []}
      isAdmin={role === "admin"}
      prefill={prefill}
    />
  );
}
