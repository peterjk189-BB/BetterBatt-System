// Shared shape, option lists and sensible defaults for the SWMS / JSA
// (Safe Work Method Statement / Job Safety Analysis), used by the editor,
// the list and the print view. This is Better Batt's own form — it isn't a
// copy of any supplier's SWMS — covering the 4 jobs our installers do:
// wall wraps (retrofit), ceiling, walls and ceiling, and underfloor.

export const JOB_TYPES = ["Wall wrap (retrofit)", "Ceiling", "Walls and ceiling", "Underfloor"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const SWMS_STATUSES = ["Draft", "Completed"] as const;
export type SwmsStatus = (typeof SWMS_STATUSES)[number];

export const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-[#fff4d6] text-[#7a5a0f] border-[#f3d48a]",
  Completed: "bg-[#e6f4ea] text-[#1f6b35] border-[#b7dfc2]",
};

/** Scope-of-work tick items, specific to each job type. */
export const SCOPE_ITEMS: Record<JobType, string[]> = {
  "Wall wrap (retrofit)": [
    "Site and access checked before starting",
    "Existing cladding/sheeting removed as required",
    "Sarking/wall wrap installed to engaged wall",
    "Joints and penetrations taped and sealed",
    "Cladding/sheeting reinstated",
    "Work area left clean and tidy",
  ],
  Ceiling: [
    "Site and access checked before starting",
    "Existing ceiling insulation removed (if required)",
    "Ceiling batts installed to specified R-value",
    "Clearance maintained around downlights, exhaust fans and flues",
    "Clearance maintained around manholes and ceiling hatches",
    "Ceiling space left clean and tidy",
  ],
  "Walls and ceiling": [
    "Site and access checked before starting",
    "Existing cladding/sheeting removed as required",
    "Sarking/wall wrap installed to engaged wall",
    "Joints and penetrations taped and sealed",
    "Existing ceiling insulation removed (if required)",
    "Ceiling batts installed to specified R-value",
    "Clearance maintained around downlights, exhaust fans and flues",
    "Work area left clean and tidy",
  ],
  Underfloor: [
    "Site and access checked before starting",
    "Underfloor insulation installed to specified R-value",
    "Insulation supported/fixed per manufacturer instructions",
    "Clearance maintained to pipes, wiring and ducting",
    "Subfloor area left clean and tidy",
  ],
};

export type HazardRow = {
  id: string;
  task: string;
  hazards: string;
  controls: string;
};

function row(task: string, hazards: string, controls: string): Omit<HazardRow, "id"> {
  return { task, hazards, controls };
}

/** The 8 standard tasks/hazards every job is checked against, pre-filled as a sensible starting point and fully editable per job. */
export const DEFAULT_HAZARDS: Omit<HazardRow, "id">[] = [
  row(
    "Loading/unloading vehicle & moving materials to site",
    "Manual handling, muscle strain, dropped materials, traffic/vehicles on site",
    "Team lift for heavy/bulky items, use trolleys where possible, wear gloves and steel-cap boots, park clear of traffic"
  ),
  row(
    "Working in the ceiling space",
    "Falls through ceiling, limited lighting, heat stress, exposed nails/screws, low clearance",
    "Walk only on ceiling joists/trusses, use a torch/head torch, take breaks in hot conditions, wear long sleeves and a hard hat where clearance is low"
  ),
  row(
    "Working near electrical installations (downlights, cabling, switchboard)",
    "Electric shock, fire risk from insulation contact with hot fittings",
    "Confirm power isolated/switched off before starting, maintain clearance around downlights and transformers per manufacturer spec, do not cover switchboards"
  ),
  row(
    "Working underfloor / in a confined space",
    "Confined space, limited air flow, pests/spiders, sharp debris, low clearance",
    "Check access and ventilation before entering, wear gloves and a dust mask, have a second person aware you're underfloor, use a torch"
  ),
  row(
    "Working at heights (ladders, manholes, roof access)",
    "Falls from height, ladder instability",
    "Use an industrial-rated ladder on firm level ground, maintain 3 points of contact, have a second person present where practical"
  ),
  row(
    "Dust and fibre exposure from insulation materials",
    "Respiratory and skin irritation from fibreglass/mineral wool dust",
    "Wear a P2 dust mask, safety glasses, gloves and long sleeves; wash exposed skin after handling"
  ),
  row(
    "Cutting and fitting insulation (knives/blades)",
    "Cuts from blades, repetitive strain",
    "Use a sharp blade and cutting board, cut away from the body, take regular breaks on large jobs"
  ),
  row(
    "Housekeeping and site clean-up",
    "Trip hazards from offcuts and packaging, slips on debris",
    "Clear offcuts and packaging as you go, bag waste for disposal, leave the work area clean and tidy"
  ),
];

export const EMPTY_HAZARDS: HazardRow[] = DEFAULT_HAZARDS.map((h, i) => ({ id: `h${i + 1}`, ...h }));

/** The full Site Report tick-box grid, laid out in the same 3 columns as the paper form. */
export const SITE_REPORT_COLUMNS: string[][] = [
  ["Muddy site", "Walk around clean", "Broken windows", "Staples in pipe", "Elevated footing", "Roof on fascia on", "Tile stacks on roof"],
  ["Fall protection", "Plaster deliveries", "Ceiling loaded", "Carpet/tiles", "Marks/dirty", "Plaster damage", "Manhole cover"],
  ["Electrical rough in", "Plumbing rough in", "Fans/downlights", "Duct fit off", "Displaced tiles", "Material excess", "2 metre fall zone"],
];
export const SITE_REPORT_ITEMS: string[] = SITE_REPORT_COLUMNS.flat();

/** Stud/joist centres — recorded for a foiling (wall wrap) job: external wall, internal walls, mid floor and ceilings. */
export type StudWidth = { external_wall: string; internal_walls: string; mid_floor: string; ceiling: string };
export const EMPTY_STUD_WIDTH: StudWidth = { external_wall: "", internal_walls: "", mid_floor: "", ceiling: "" };

/** Job types where sarking/foil wrap is part of the scope — stud centres should be recorded for these. */
export const FOILING_JOB_TYPES: JobType[] = ["Wall wrap (retrofit)", "Walls and ceiling"];

export type SiteReport = {
  items: Record<string, boolean>;
  power_isolated_tagged: boolean;
  power_restored: boolean;
  other_note: string;
  stud_width: StudWidth;
};

export const EMPTY_SITE_REPORT: SiteReport = {
  items: Object.fromEntries(SITE_REPORT_ITEMS.map((i) => [i, false])),
  power_isolated_tagged: false,
  power_restored: false,
  other_note: "",
  stud_width: EMPTY_STUD_WIDTH,
};

/** Ticked once each item's done/confirmed, shown as a checklist on the form — matches the paper form's "Tick photo's taken" list. */
export const PHOTO_ITEMS = [
  "All installed areas (min 6 photos)",
  "Site board (must be included)",
  "Insulated heater platform",
  "Split packs in ceiling",
  "Areas that can not be completed",
  "Any site damage",
  "Showing secured site / inc bin",
  "Showing clean site after install",
  "Polyester infills",
];

export type Installer = { name: string; signed_name: string; signed_at: string | null };

export function normaliseHazards(raw: unknown): HazardRow[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((r: any, i: number) => ({
      id: r?.id || `h${i + 1}`,
      task: r?.task || "",
      hazards: r?.hazards || "",
      controls: r?.controls || "",
    }));
  }
  return EMPTY_HAZARDS;
}

export function normaliseSiteReport(raw: unknown): SiteReport {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<SiteReport>;
  const items = { ...EMPTY_SITE_REPORT.items, ...(src.items || {}) };
  const stud_width = { ...EMPTY_STUD_WIDTH, ...(src.stud_width || {}) };
  return { ...EMPTY_SITE_REPORT, ...src, items, stud_width };
}

export function normaliseScope(raw: unknown, jobType: JobType): Record<string, boolean> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, boolean>;
  const out: Record<string, boolean> = {};
  for (const item of SCOPE_ITEMS[jobType]) out[item] = !!src[item];
  return out;
}

export function normalisePhotosChecklist(raw: unknown): Record<string, boolean> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, boolean>;
  const out: Record<string, boolean> = {};
  for (const item of PHOTO_ITEMS) out[item] = !!src[item];
  return out;
}

export function normaliseInstallers(raw: unknown): Installer[] {
  if (Array.isArray(raw)) {
    return raw.map((r: any) => ({ name: r?.name || "", signed_name: r?.signed_name || "", signed_at: r?.signed_at || null }));
  }
  return [];
}

export type SwmsRecord = {
  id: string;
  swms_number: number;
  job_date: string;
  time_in: string | null;
  time_out: string | null;
  job_type: JobType;
  status: SwmsStatus;
  builder_name: string | null;
  site_address: string | null;
  suburb: string | null;
  customer_id: string | null;
  project_id: string | null;
  work_order_id: string | null;
  scope: Record<string, boolean>;
  hazards: HazardRow[];
  site_report: SiteReport;
  photos_checklist: Record<string, boolean>;
  installers: Installer[];
  comments: string | null;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SwmsPhoto = {
  id: string;
  category: "Photo" | "SWMS";
  storage_path: string;
  file_name: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export function swmsLabel(s: { swms_number: number; site_address?: string | null }) {
  return `SWMS${s.swms_number}${s.site_address ? " — " + s.site_address : ""}`;
}
