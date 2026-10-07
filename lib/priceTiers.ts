// Supply-only price points. "standard" (null on the quote) is the original
// supply_charge_per_pack, so quotes made before price points existed don't change.
export type PriceTier = "retail" | "trade" | "regency";

export const PRICE_TIERS: { value: PriceTier; label: string; field: "price_retail" | "price_trade" | "price_regency" }[] = [
  { value: "retail", label: "Retail", field: "price_retail" },
  { value: "trade", label: "Trade", field: "price_trade" },
  { value: "regency", label: "Regency", field: "price_regency" },
];

type TierPart = {
  supply_charge_per_pack: number;
  price_retail?: number | null;
  price_trade?: number | null;
  price_regency?: number | null;
};

export function tierLabel(tier: string | null | undefined) {
  return PRICE_TIERS.find((t) => t.value === tier)?.label ?? "Standard";
}

/** Supply-only $/pack for a tier. A tier price left at 0 falls back to the standard price. */
export function supplyPackPrice(part: TierPart, tier: string | null | undefined) {
  const t = PRICE_TIERS.find((x) => x.value === tier);
  const v = t ? Number(part[t.field]) || 0 : 0;
  return v > 0 ? v : part.supply_charge_per_pack;
}

/** True when a tier was picked but this item has no price entered for it. */
export function tierPriceMissing(part: TierPart, tier: string | null | undefined) {
  const t = PRICE_TIERS.find((x) => x.value === tier);
  return !!t && !(Number(part[t.field]) > 0);
}
