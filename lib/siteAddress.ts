/** "Lot 12, 5 Smith St, Brunswick" — the lot number goes first, without doubling up a "Lot" already typed. */
export function siteAddress(p: { lot_no?: string | null; address?: string | null; suburb?: string | null } | null | undefined) {
  if (!p) return "";
  const lot = p.lot_no?.trim();
  return [lot ? (/^lot\b/i.test(lot) ? lot : `Lot ${lot}`) : null, p.address, p.suburb].filter(Boolean).join(", ");
}
