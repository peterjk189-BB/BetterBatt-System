export type FuelLevyType = "amount" | "percent";

/** Fuel levy in dollars (ex GST): either a fixed amount or a % of the PO subtotal. */
export function fuelLevyAmount(subtotal: number, type: string | null | undefined, value: number | string | null | undefined): number {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  return type === "percent" ? subtotal * (v / 100) : v;
}
