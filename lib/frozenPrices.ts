// Sell prices frozen on a quote line once the quote has gone to the customer.
//
// Quote line charges were worked out from the product's CURRENT Inventory price, so changing a
// price on the Inventory page silently changed every quote already emailed (e.g. Q1095 went from
// $3,049.00 to $3,199.70). Migration 0108 copies the product's sell prices onto each line
// (project_lines.price_snapshot) when the quote is first emailed or accepted, and pricedPart() makes
// every quote total, print, customer link, report and invoice use those copied prices.
// Costs (pack cost, installer rate) stay live, so job profit still uses real costs.

export type PriceSnapshot = {
  part_id?: string | null;
  supply_install_rate_per_m2?: number | null;
  supply_charge_per_pack?: number | null;
  price_retail?: number | null;
  price_trade?: number | null;
  price_regency?: number | null;
  frozen_at?: string | null;
};

const FIELDS = ["supply_install_rate_per_m2", "supply_charge_per_pack", "price_retail", "price_trade", "price_regency"] as const;

/** The line's snapshot, if it still belongs to the product on the line (picking another product drops it). */
export function lineSnapshot(line: { price_snapshot?: PriceSnapshot | null; part_id?: string | null } | null | undefined): PriceSnapshot | null {
  const s = line?.price_snapshot;
  if (!s || typeof s !== "object") return null;
  if (s.part_id && line?.part_id && s.part_id !== line.part_id) return null;
  return s;
}

/** The product as priced on this quote line: its frozen sell prices when the quote has been sent, else the live ones. */
export function pricedPart<T>(part: T, line: { price_snapshot?: PriceSnapshot | null; part_id?: string | null } | null | undefined): T {
  const s = lineSnapshot(line);
  if (!part || !s) return part;
  const out: any = { ...(part as any) };
  for (const f of FIELDS) {
    if (s[f] !== undefined && s[f] !== null) out[f] = Number(s[f]);
  }
  return out as T;
}
