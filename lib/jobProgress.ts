// Where a work order is up to in the job flow:
//   SWMS from the installer -> inspection -> PASS, or FAIL -> re-inspection
// Worked out from that work order's SWMS and inspection records, shared by
// the work order page's progress strip, the Work Orders list and the
// Inspections "due" panel.

export type ProgressSwms = { id: string; status: string; archived?: boolean; swms_number?: number };
export type ProgressInspection = {
  id: string;
  inspection_number: number;
  status: string;
  result: string | null;
  parent_inspection_id: string | null;
  archived?: boolean;
};

export type JobStage =
  | "awaiting-swms"
  | "swms-draft"
  | "inspection-due"
  | "inspecting"
  | "reinspection-due"
  | "passed";

export const STAGE_LABEL: Record<JobStage, string> = {
  "awaiting-swms": "Awaiting SWMS",
  "swms-draft": "SWMS in progress",
  "inspection-due": "Inspection due",
  inspecting: "Inspection in progress",
  "reinspection-due": "FAIL — re-inspection due",
  passed: "Inspection PASS",
};

export const STAGE_STYLE: Record<JobStage, string> = {
  "awaiting-swms": "bg-[#f2f0ec] text-[#6b6862] border-[#e4e1da]",
  "swms-draft": "bg-[#fff4d6] text-[#7a5a0f] border-[#f3d48a]",
  "inspection-due": "bg-[#fff4d6] text-[#7a5a0f] border-[#f3d48a]",
  inspecting: "bg-[#e8effd] text-[#1e40af] border-[#bfd0f7]",
  "reinspection-due": "bg-[#fde8e8] text-[#9b1c1c] border-[#f5b5b5]",
  passed: "bg-[#e6f4ea] text-[#1f6b35] border-[#b7dfc2]",
};

export function jobProgress(swms: ProgressSwms[], inspections: ProgressInspection[]) {
  const liveSwms = swms.filter((s) => !s.archived);
  const live = inspections.filter((i) => !i.archived).sort((a, b) => a.inspection_number - b.inspection_number);
  const swmsDone = liveSwms.some((s) => s.status === "Completed");
  const latest = live.length ? live[live.length - 1] : null;

  let stage: JobStage;
  if (latest) {
    if (latest.result === "PASS") stage = "passed";
    else if (latest.result === "FAIL") stage = "reinspection-due";
    else stage = "inspecting";
  } else if (swmsDone) stage = "inspection-due";
  else if (liveSwms.length) stage = "swms-draft";
  else stage = "awaiting-swms";

  return { stage, swmsDone, swms: liveSwms, inspections: live, latest };
}
