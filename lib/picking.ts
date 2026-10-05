// Shared types and calculations for the picking slip — the reserve-and-pick
// workflow for pulling materials off the shelf for a work order. Each work
// order line already says which product and how many m² are needed; this
// turns that into "how many packs" against real stock, and works out what's
// still available once other jobs' reservations are taken into account.

export type PickingPart = {
  id: string;
  name: string;
  code: string | null;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  supplier_id: string | null;
  stock_on_hand: number;
  pack_per_multi: number;
};

export type PickingLine = {
  id: string;
  qty: number; // m² needed, from the work order line
  part_id: string | null;
  allocated: boolean;
  allocated_at: string | null;
  picked: boolean;
  picked_at: string | null;
  multi_picked: number | null;
  packs_picked: number | null;
  note: string | null;
};

/** Whole packs required to cover the given m² — always rounded up, since you can't open or order a fraction of a pack. */
export function packsNeeded(qtyM2: number, coverageM2: number): number {
  if (!coverageM2 || coverageM2 <= 0) return 0;
  return Math.ceil(qtyM2 / coverageM2 - 1e-9);
}

/** Suggested quantity to actually pick — same as packsNeeded, kept as a separate name for where it's used as a default. */
export function suggestedPick(qtyM2: number, coverageM2: number): number {
  return packsNeeded(qtyM2, coverageM2);
}

export function fmtPacks(n: number): string {
  return `${n} pack${n === 1 ? "" : "s"}`;
}

/**
 * Formats a picked quantity as "N multis + M packs", dropping whichever part is zero.
 * There's no suggested split here on purpose — how a pick breaks down between full
 * multi-packs and loose packs is a judgement call made at the shelf, not a calculation.
 */
export function fmtSplit(multi: number, pks: number): string {
  const parts: string[] = [];
  if (multi) parts.push(`${multi} multi${multi === 1 ? "" : "s"}`);
  if (pks || parts.length === 0) parts.push(`${pks} pack${pks === 1 ? "" : "s"}`);
  return parts.join(" + ");
}

export type PickStatus = "not-allocated" | "allocated" | "picked";

export function lineStatus(l: Pick<PickingLine, "allocated" | "picked">): PickStatus {
  if (l.picked) return "picked";
  if (l.allocated) return "allocated";
  return "not-allocated";
}

export const STATUS_LABELS: Record<PickStatus, string> = {
  "not-allocated": "Not allocated",
  allocated: "Allocated",
  picked: "Picked",
};

export const STATUS_STYLES: Record<PickStatus, string> = {
  "not-allocated": "bg-[#f1f0ed] text-[#6b6862] border-[#e4e1da]",
  allocated: "bg-[#fff4d6] text-[#7a5a0f] border-[#f3d48a]",
  picked: "bg-[#e6f4ea] text-[#1f6b35] border-[#b7dfc2]",
};
