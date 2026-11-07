// Builder contract pricing (e.g. Maple Living): a builder has its own agreed supply & install $/m² for
// products we already stock. Each contract line points at a normal Inventory item (so stock, cost,
// pack coverage and installer rate stay in one place) and adds the builder's own wording + m² rate.
// When a quote line is picked from the contract list, the rate and wording are copied onto the line
// (project_lines.contract_rate / contract_description) so later rate changes never alter old quotes.

export type ContractRate = {
  id: string;
  customer_id: string;
  part_id: string | null;
  builder_description: string;
  rate_per_m2: number;
  effective_from: string; // yyyy-mm-dd
  sort_order: number;
  notes?: string | null;
  archived?: boolean;
};

type SiPart = { coverage_m2: number; supply_install_rate_per_m2: number } | null | undefined;

export function hasContractRate(contractRate: number | string | null | undefined) {
  return contractRate !== null && contractRate !== undefined && contractRate !== "" && !Number.isNaN(Number(contractRate));
}

/**
 * Supply & install charge for one quote line.
 * Contract line: builder's $/m² × the m² entered (builders pay on plan m², matching their PO).
 * Normal line: Inventory supply+install $/m² × the m² of whole packs used (unchanged).
 */
export function supplyInstallCharge(qty: number, part: SiPart, contractRate?: number | string | null) {
  const q = Number(qty) || 0;
  if (hasContractRate(contractRate)) return q * Number(contractRate);
  if (!part) return 0;
  const packs = part.coverage_m2 > 0 ? Math.ceil(q / part.coverage_m2) : 0;
  return packs * part.coverage_m2 * (Number(part.supply_install_rate_per_m2) || 0);
}

/** Wording shown to the customer for a line: the builder's own wording when it came from a contract. */
export function lineLabel(l: { contract_description?: string | null; parts?: { name?: string | null } | null }) {
  return (l.contract_description || "").trim() || l.parts?.name || "—";
}

/** The rate set in force on a date: the latest effective_from on or before it (else the earliest set). */
export function activeRateDate(rates: Pick<ContractRate, "effective_from">[], onDate: string) {
  const dates = Array.from(new Set(rates.map((r) => r.effective_from))).sort();
  if (dates.length === 0) return null;
  const onOrBefore = dates.filter((d) => d <= onDate);
  return onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : dates[0];
}

export function activeRates<T extends ContractRate>(rates: T[], onDate: string) {
  const d = activeRateDate(rates, onDate);
  return rates
    .filter((r) => !r.archived && r.effective_from === d)
    .sort((a, b) => a.sort_order - b.sort_order || a.builder_description.localeCompare(b.builder_description));
}
