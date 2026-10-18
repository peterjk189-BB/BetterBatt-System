/**
 * Contractor pay rate for one work order line (per unit of qty, normally per m²).
 * 1. the rate saved on the line itself (locked when the line was saved), else
 * 2. the old Task (labour item) rate on historic lines, else
 * 3. the product's installer rate on the inventory page.
 */
export function lineRate(
  saved: number | string | null | undefined,
  labourRate: number | string | null | undefined,
  partRate: number | string | null | undefined
): number {
  if (saved !== null && saved !== undefined && saved !== "") return Number(saved) || 0;
  if (labourRate !== null && labourRate !== undefined && labourRate !== "") return Number(labourRate) || 0;
  return Number(partRate) || 0;
}
