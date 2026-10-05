// Shared shape, checklists and helpers for the site Inspection Report,
// used by the editor, the list and the print view. Replaces the Bradford
// "Inspection Report" PDF. A report covers any mix of Foil, Wall batt and
// Ceiling inspections — each one is switched on with an include_* tick and
// only the ticked sections are shown and printed.

export const INSPECTION_STATUSES = ["Draft", "Completed"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-[#fff4d6] text-[#7a5a0f] border-[#f3d48a]",
  Completed: "bg-[#e6f4ea] text-[#1f6b35] border-[#b7dfc2]",
};

export const RESULTS = ["PASS", "FAIL"] as const;
export type InspectionResult = (typeof RESULTS)[number];

export const ANSWERS = ["Yes", "No", "NA"] as const;
export type Answer = (typeof ANSWERS)[number] | "";

export type SectionKey = "foil" | "wall" | "ceiling";

/** Everything one inspection section stores, in its jsonb column. */
export type SectionData = {
  /** Header tick-boxes (Ground Floor, Glasswool, …). */
  options: Record<string, boolean>;
  /** Yes / No / NA answer per checklist line. */
  checks: Record<string, Answer>;
  /** Small free-text boxes beside some items (e.g. Dampcourse, Downlight clearance). */
  notes: Record<string, string>;
  /** Extra tick-boxes under the checklist (ceiling only). */
  extras: Record<string, boolean>;
  comments: string;
  /** On a re-inspection: the lines that were answered "No" on the inspection it follows up. */
  flagged: string[];
};

export type SectionDef = {
  key: SectionKey;
  includeField: "include_foil" | "include_wall" | "include_ceiling";
  label: string;
  title: string;
  options: string[];
  /** Header options that get a small text box beside them. */
  optionNotes: string[];
  checks: string[];
  /** Checklist lines that get a small text box beside the answer. */
  checkNotes: string[];
  extras: string[];
};

export const SECTIONS: SectionDef[] = [
  {
    key: "foil",
    includeField: "include_foil",
    label: "Foil Inspection",
    title: "Foil Inspection",
    options: ["Ground Floor", "First Floor", "Timber Frame", "Steel Frame", "Dampcourse", "Taping of opening", "Fibertex"],
    optionNotes: ["Dampcourse"],
    checks: [
      "Dampcourse running 150mm past external corners",
      "Installed and ordered material checked",
      "Full coverage",
      "External garage wall wrapped",
      "Common wall wrapped",
      "Horizontal and vertical joins taped",
      "Penetrations sealed",
      "Tension to standard",
      "Installed to window / door frames",
      "Door and window header / footers wrapped",
      "Posi-strut wrapped",
      "Wall over ground floor protrusions wrapped",
      "Staples as per Work Method Statement",
      "Screws used as per Work Method Statement",
      "Masonite packing strips used as per WMS",
      "Double sided tape used as per WMS",
      "Install neat and tidy",
      "Left over foil and packaging removed",
    ],
    checkNotes: [],
    extras: [],
  },
  {
    key: "wall",
    includeField: "include_wall",
    label: "Wall Inspection",
    title: "Wall Batt Inspection",
    options: ["Poly Infills", "5 Star Inspection", "Fireseal", "Perimeter String", "Glasswool", "Soundscreen"],
    optionNotes: [],
    checks: [
      "Installed and ordered material checked",
      "Full coverage external walls",
      "Common wall insulated",
      "External garage wall insulated",
      "Window and door headers / footers insulated",
      "Meter box taped",
      "Power points to standard",
      "Electrical wires / plumbing checked in",
      "Heating / cooling platform insulated",
      "Stringing to standard",
      "Ground floor protrusions insulated",
      "Ceiling loaded",
      "Ceiling tights / perimeter",
      "Install neat and tidy",
      "Left over insulation and packaging removed",
    ],
    checkNotes: [],
    extras: [],
  },
  {
    key: "ceiling",
    includeField: "include_ceiling",
    label: "Ceiling Inspection",
    title: "Ceiling Inspection",
    options: ["Mid Floor", "Sub Floor", "Glasswool", "Soundscreen", "Optimo"],
    optionNotes: [],
    checks: [
      "Installed and ordered material checked",
      "Full coverage",
      "Tight sections completed",
      "Bulkheads / drop ceiling insulated",
      "Insulation installed over manhole cover",
      "Insulation installed 50mm past top plate",
      "Ground floor protrusions insulated",
      "Insulation installed under wiring and plumbing",
      "Insulation under walk boards",
      "Downlight clearance satisfactory",
      "Electrical appliances clearance satisfactory",
      "Ducting clearance satisfactory",
      "Hanging tape is not twisted or sagging",
      "Hanging tape has been stapled to each truss",
      "Install neat and tidy",
      "Left over insulation and packaging removed",
    ],
    checkNotes: ["Downlight clearance satisfactory"],
    extras: ["No ceiling damage or marking on manhole", "Power Isolated and Tagged", "Tag Removed and Power Restored"],
  },
];

export function emptySection(): SectionData {
  return { options: {}, checks: {}, notes: {}, extras: {}, comments: "", flagged: [] };
}

export function normaliseSection(raw: unknown): SectionData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SectionData>;
  const checks: Record<string, Answer> = {};
  for (const [k, v] of Object.entries(r.checks ?? {})) {
    checks[k] = (ANSWERS as readonly string[]).includes(v as string) ? (v as Answer) : "";
  }
  return {
    options: { ...(r.options ?? {}) },
    checks,
    notes: { ...(r.notes ?? {}) },
    extras: { ...(r.extras ?? {}) },
    comments: typeof r.comments === "string" ? r.comments : "",
    flagged: Array.isArray(r.flagged) ? r.flagged.filter((x): x is string => typeof x === "string") : [],
  };
}

/**
 * Starting point for a re-inspection's section, from the FAILed inspection
 * it follows up: header ticks and notes carry over, lines that passed keep
 * their answer, and lines that were "No" are cleared and flagged so the
 * inspector re-checks exactly those.
 */
export function reinspectionSection(raw: unknown): SectionData {
  const prev = normaliseSection(raw);
  const checks: Record<string, Answer> = {};
  const flagged: string[] = [];
  for (const [item, a] of Object.entries(prev.checks)) {
    if (a === "No") flagged.push(item);
    else if (a) checks[item] = a;
  }
  return { options: prev.options, checks, notes: prev.notes, extras: prev.extras, comments: "", flagged };
}

/**
 * Which inspections to tick (and which header options) from the installer's
 * SWMS for the job — its job type plus its scope-of-work ticks.
 */
export function sectionsFromSwms(jobType: string | null | undefined, scopeRaw: unknown) {
  const include = { include_foil: false, include_wall: false, include_ceiling: false };
  const options: Record<SectionKey, Record<string, boolean>> = { foil: {}, wall: {}, ceiling: {} };

  if (jobType === "Wall wrap (retrofit)") include.include_foil = true;
  if (jobType === "Ceiling") include.include_ceiling = true;
  if (jobType === "Walls and ceiling") {
    include.include_wall = true;
    include.include_ceiling = true;
  }
  if (jobType === "Underfloor") {
    include.include_ceiling = true;
    options.ceiling["Sub Floor"] = true;
  }

  const scope = (scopeRaw && typeof scopeRaw === "object" ? (scopeRaw as { items?: Record<string, boolean> }).items : null) || {};
  const ticked = (k: string) => !!scope[k];
  if (ticked("Dampcourse")) {
    include.include_foil = true;
    options.foil["Dampcourse"] = true;
  }
  if (ticked("Wrap - GF")) {
    include.include_foil = true;
    options.foil["Ground Floor"] = true;
  }
  if (ticked("Wrap - FF")) {
    include.include_foil = true;
    options.foil["First Floor"] = true;
  }
  if (ticked("Wall Insulation")) include.include_wall = true;
  if (ticked("Polyester Infill")) {
    include.include_wall = true;
    options.wall["Poly Infills"] = true;
  }
  if (ticked("5 Star Inspection")) {
    include.include_wall = true;
    options.wall["5 Star Inspection"] = true;
  }
  if (ticked("Fireseal")) {
    include.include_wall = true;
    options.wall["Fireseal"] = true;
  }
  if (ticked("Ceiling Load") || ticked("Ceiling Spread")) include.include_ceiling = true;
  if (ticked("Sub/Mid Floor")) include.include_ceiling = true;

  return { include, options };
}

export type InspectionRecord = {
  id: string;
  inspection_number: number;
  inspection_date: string;
  inspection_time: string | null;
  status: InspectionStatus;
  builder_name: string | null;
  site_address: string | null;
  suburb: string | null;
  contractor: string | null;
  sales_order: string | null;
  audit_region: string | null;
  include_foil: boolean;
  include_wall: boolean;
  include_ceiling: boolean;
  result: InspectionResult | null;
  maintenance: "Yes" | "No" | null;
  rectifications: string | null;
  foil: unknown;
  wall: unknown;
  ceiling: unknown;
  inspector_name: string | null;
  installer_name: string | null;
  inspector_signature: string | null;
  signed_at: string | null;
  customer_id: string | null;
  project_id: string | null;
  work_order_id: string | null;
  parent_inspection_id: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type InspectionPhoto = {
  id: string;
  category: string;
  storage_path: string;
  file_name: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export function inspectionLabel(r: { inspection_number: number; site_address?: string | null }) {
  return `INS${r.inspection_number}${r.site_address ? " — " + r.site_address : ""}`;
}

/** Short summary of which sections a report covers, e.g. "Wall · Ceiling". */
export function sectionsSummary(r: { include_foil: boolean; include_wall: boolean; include_ceiling: boolean }) {
  const parts = [r.include_foil && "Foil", r.include_wall && "Wall", r.include_ceiling && "Ceiling"].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

/** What a brand-new inspection starts with — from its work order + SWMS, or from the FAILed inspection it re-inspects. */
export type InspectionPrefill = {
  work_order_id?: string;
  project_id?: string;
  site_address?: string;
  suburb?: string;
  builder_name?: string;
  contractor?: string;
  installer_name?: string;
  sales_order?: string;
  audit_region?: string;
  include_foil?: boolean;
  include_wall?: boolean;
  include_ceiling?: boolean;
  sections?: Partial<Record<SectionKey, SectionData>>;
  parent_inspection_id?: string;
  parent_number?: number;
  /** Plain-English note of where the prefill came from, shown at the top of the form. */
  source?: string;
};
