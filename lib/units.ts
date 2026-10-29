// Per-product unit names (migration 0076). Insulation stays "pack" / "multi"; wall wrap can be "roll", boxed items "box" / "carton".

export type UnitPart = { pack_unit?: string | null; multi_unit?: string | null; pack_per_multi?: number | null } | null | undefined;

export function plural(word: string, n: number): string {
  if (n === 1) return word;
  return /(s|x|z|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`;
}

export function unitsOf(part: UnitPart) {
  const one = (part?.pack_unit || "").trim() || "pack";
  const bulkName = (part?.multi_unit ?? "multi").toString().trim();
  const perBulk = Number(part?.pack_per_multi) || 0;
  // Bulk is only used when the product has a bulk unit name and more than one single unit per bulk.
  const hasBulk = !!bulkName && perBulk > 1;
  return { one, bulk: bulkName || "multi", hasBulk, perBulk };
}

/** "5 multis + 3 packs" in the product's own units. */
export function fmtPicked(part: UnitPart, multi: number, pks: number): string {
  const u = unitsOf(part);
  const bits: string[] = [];
  if (multi) bits.push(`${multi} ${plural(u.bulk, multi)}`);
  if (pks || bits.length === 0) bits.push(`${pks} ${plural(u.one, pks)}`);
  return bits.join(" + ");
}
