import { supplyPackPrice } from "@/lib/priceTiers";

type PartForTotal = {
  coverage_m2: number;
  supply_charge_per_pack: number;
  supply_install_rate_per_m2: number;
  price_retail?: number | null;
  price_trade?: number | null;
  price_regency?: number | null;
} | null;

/** Quote total ex GST / GST / inc GST, the same sums the quote print view uses. */
export function quoteTotals(
  project: { job_type: string; quote_markup: number | null; price_tier?: string | null; customers?: { discount_pct: number | null } | null },
  lines: { qty_m2: number; parts: PartForTotal }[]
) {
  const isSupplyOnly = project.job_type === "SUPPLY ONLY";
  const before = lines.reduce((s, l) => {
    const part = l.parts;
    if (!part) return s;
    const q = Number(l.qty_m2) || 0;
    const packs = part.coverage_m2 > 0 ? Math.ceil(q / part.coverage_m2) : 0;
    const used = packs * part.coverage_m2;
    return s + (isSupplyOnly ? packs * supplyPackPrice(part as any, project.price_tier) : used * part.supply_install_rate_per_m2);
  }, 0);
  const disc = before * ((project.customers?.discount_pct || 0) / 100);
  const ex = before - disc + (Number(project.quote_markup) || 0);
  const gst = ex * 0.1;
  return { ex, gst, total: ex + gst };
}
