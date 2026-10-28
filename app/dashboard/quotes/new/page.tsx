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

export default async function NewQuotePage({ searchParams }: { searchParams: { site_visit_id?: string; calc?: string; tier?: string } }) {
  const supabase = await createClient();
  const [{ data: customers }, { data: parts }, role] = await Promise.all([
    supabase.from("customers").select("*").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  let prefill: QuotePrefill | null = null;
  let visitCustomers: any[] | null = null;
  if (searchParams.site_visit_id) {
    const { data: v } = await supabase.from("site_visits").select("*").eq("id", searchParams.site_visit_id).single();
    if (v) {
      const c = normaliseChecklist(v.checklist);
      let customerList = customers ?? [];
      let linked = customerList.find((x) => x.id === v.customer_id);
      // A visit linked to a customer who has since been archived: still show them in the list.
      if (!linked && v.customer_id) {
        const { data: arch } = await supabase.from("customers").select("*").eq("id", v.customer_id).maybeSingle();
        if (arch) {
          linked = arch;
          customerList = [...customerList, arch];
        }
      }
      // Visit has only a typed name (no linked customer): use the customer with the same name, if there is exactly one.
      if (!linked && v.customer_name?.trim()) {
        const want = v.customer_name.trim().toLowerCase();
        const exact = customerList.filter((x) => String(x.name || "").trim().toLowerCase() === want);
        if (exact.length === 1) linked = exact[0];
      }
      visitCustomers = customerList;
      const product = c.underfloor_products[0] || "";
      const wanted: { label: string; qty: number; note?: string }[] = [
        { label: `${c.ceiling_r_rating} 430`, qty: num(c.ceiling_430_m2) },
        { label: `${c.ceiling_r_rating} 580`, qty: num(c.ceiling_580_m2) },
        { label: `wall ${c.wall_r_rating}`.trim(), qty: num(c.wall_ext_gf_m2), note: "External walls — ground floor" },
        { label: `wall ${c.wall_r_rating}`.trim(), qty: num(c.wall_ext_ff_m2), note: "External walls — first floor" },
        { label: `wall ${c.wall_int_r_rating}`.trim(), qty: num(c.wall_int_m2), note: "Internal / acoustic walls" },
        { label: product || "underfloor 415", qty: num(c.underfloor_415_m2) },
        { label: product ? `${product} 565` : "underfloor 565", qty: num(c.underfloor_565_m2) },
      ]
        .filter((_, i) => !c.ceiling_only || i < 2)
        .filter((w) => w.qty > 0);

      prefill = {
        siteVisit: { id: v.id, visit_number: v.visit_number },
        customer_id: linked?.id || v.customer_id || "",
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
          note: w.note ?? null,
          sort_order: i,
        })),
      };
    }
  }

  // Started from the pack calculator: ?calc=<partId>:<m2>,<partId>:<m2>&tier=retail
  if (!prefill && searchParams.calc) {
    const partIds = new Set((parts ?? []).map((p: any) => p.id));
    const lines = searchParams.calc
      .split(",")
      .map((x) => x.split(":"))
      .filter(([id, m2]) => partIds.has(id) && Number(m2) > 0)
      .map(([id, m2], i) => ({ part_id: id, qty_m2: Number(m2), note: null, sort_order: i }));
    if (lines.length > 0) {
      prefill = {
        fromCalculator: true,
        job_type: "SUPPLY ONLY",
        price_tier: ["retail", "trade", "regency"].includes(searchParams.tier || "") ? searchParams.tier : "retail",
        customer_id: "",
        customer_name: "",
        category: "",
        contact_name: "",
        contact_phone: "",
        contact_email: "",
        address: "",
        suburb: "",
        lines: lines as any,
      };
    }
  }

  return (
    <QuoteEditor
      project={null}
      lines={[]}
      customers={visitCustomers ?? customers ?? []}
      parts={parts ?? []}
      isAdmin={role === "admin"}
      prefill={prefill}
      crmEnabled={role === "admin" || role === "office"}
    />
  );
}
