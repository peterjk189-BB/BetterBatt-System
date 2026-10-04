// Shared shape and option lists for the Site Visit checklist, used by the
// editor, the list, the print view and the "Create quote" prefill. The
// options mirror the paper/PDF Site Visit Checklist so the office sees the
// same boxes it always has.

export const VISIT_STATUSES = ["Booked", "Visited", "Quoted", "Cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const VISIT_TYPES = ["Retro fit", "Building site"] as const;

export const ROOF_TYPES = ["Tile roof", "Tin roof", "Pitched roof", "Flat roof"];
export const STOREYS = ["Single storey", "Double storey"];
export const TRUSS_SIZES = ["450", "600", "900", "Mixed"];
export const CEILING_EXISTING = ["Ceiling empty", "Blow-in installed", "Batts installed"];
export const ACCESS_LEVELS = ["Excellent", "Good", "Hard", "Limited", "Can't do"];
export const CEILING_SUITABILITY = ["Mixed"];
export const UNDERFLOOR_SUITABILITY = ["Mixed", "Cutting", "String batts"];
export const UNDERFLOOR_PRODUCTS = ["PolyFloor R2.5 450", "R2.0 450", "430 SoundBreak", "580 SoundBreak"];

export type Checklist = {
  roof: string[];
  storeys: string;
  truss: string;
  existing: string[];
  remove_batts: boolean;
  tile_lift: boolean;
  tile_lift_qty: string;
  quote_ceiling: boolean;
  quote_underfloor: boolean;

  ceiling_430_m2: string;
  ceiling_580_m2: string;
  ceiling_r_rating: string;
  ceiling_method: string;
  ceiling_suitability: string[];
  ceiling_access: string[];

  underfloor_415_m2: string;
  underfloor_565_m2: string;
  underfloor_suitability: string[];
  underfloor_access: string[];
  underfloor_products: string[];

  power_isolation_explained: boolean;

  /** Room-by-room length × width, used to work out the m² on site. */
  rooms: Room[];
};

export type Room = { id: string; area: "Ceiling" | "Underfloor"; name: string; length: string; width: string };

export function roomArea(r: Room) {
  return Math.round(num(r.length) * num(r.width) * 100) / 100;
}

export const EMPTY_CHECKLIST: Checklist = {
  roof: [],
  storeys: "",
  truss: "",
  existing: [],
  remove_batts: false,
  tile_lift: false,
  tile_lift_qty: "",
  quote_ceiling: false,
  quote_underfloor: false,

  ceiling_430_m2: "",
  ceiling_580_m2: "",
  ceiling_r_rating: "",
  ceiling_method: "",
  ceiling_suitability: [],
  ceiling_access: [],

  underfloor_415_m2: "",
  underfloor_565_m2: "",
  underfloor_suitability: [],
  underfloor_access: [],
  underfloor_products: [],

  power_isolation_explained: false,

  rooms: [],
};

/** Fill any keys missing from a stored checklist (older rows, new options) with defaults. */
export function normaliseChecklist(raw: unknown): Checklist {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<Checklist>;
  return { ...EMPTY_CHECKLIST, ...src };
}

export type SiteVisit = {
  id: string;
  visit_number: number;
  visit_date: string;
  visit_time: string | null;
  status: VisitStatus;
  visit_type: string;
  customer_id: string | null;
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  suburb: string | null;
  checklist: Checklist;
  notes: string | null;
  project_id: string | null;
  assigned_to: string | null;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Staff = { id: string; full_name: string | null };

export function staffLabel(s: { full_name: string | null } | null | undefined) {
  return s?.full_name || "Unnamed user";
}

export type VisitPhoto = {
  id: string;
  category: "Photo" | "Site plan";
  storage_path: string;
  file_name: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export function visitLabel(v: { visit_number: number; customer_name: string | null }) {
  return `SV${v.visit_number}${v.customer_name ? " — " + v.customer_name : ""}`;
}

export function num(s: string | null | undefined) {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Short "what was measured" chips for the list and print header, e.g. "Underfloor 57 m²". */
export function measuredSummary(c: Checklist): string[] {
  const out: string[] = [];
  const ceiling = num(c.ceiling_430_m2) + num(c.ceiling_580_m2);
  const underfloor = num(c.underfloor_415_m2) + num(c.underfloor_565_m2);
  if (c.quote_ceiling || ceiling) out.push(ceiling ? `Ceiling ${ceiling} m²` : "Ceiling");
  if (c.quote_underfloor || underfloor) out.push(underfloor ? `Underfloor ${underfloor} m²` : "Underfloor");
  return out;
}

export const STATUS_STYLES: Record<string, string> = {
  Booked: "bg-[#fff4d6] text-[#7a5a0f] border-[#f3d48a]",
  Visited: "bg-[#e8f0fe] text-[#1e4fbf] border-[#bcd0fb]",
  Quoted: "bg-[#e6f4ea] text-[#1f6b35] border-[#b7dfc2]",
  Cancelled: "bg-[#f1f0ed] text-[#6b6862] border-[#e4e1da]",
};
