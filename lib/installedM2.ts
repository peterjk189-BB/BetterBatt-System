/**
 * Installed m² for a work order line. Only stock (inventory) products count:
 * non-stock items (delivery, tape, scaffold) and $ lines with no product
 * (travel allowance, call-out / small-job fees, labour items) are left out of job m² totals.
 */
export function installedM2(line: { qty?: number | string | null; parts?: { is_stock_item?: boolean | null } | null }): number {
  if (!line.parts || line.parts.is_stock_item === false) return 0;
  return Number(line.qty) || 0;
}
