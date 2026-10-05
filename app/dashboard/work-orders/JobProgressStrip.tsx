import Link from "next/link";
import { STAGE_LABEL, STAGE_STYLE, jobProgress, type ProgressInspection, type ProgressSwms } from "@/lib/jobProgress";

// SWMS ✓ → Inspection FAIL → Re-inspection PASS ✓ — at a glance, at the top of a work order.
export default function JobProgressStrip({
  workOrderId,
  swms,
  inspections,
}: {
  workOrderId: string;
  swms: ProgressSwms[];
  inspections: ProgressInspection[];
}) {
  const p = jobProgress(swms, inspections);
  const completedSwms = p.swms.find((s) => s.status === "Completed") || p.swms[0];

  const chip = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium";
  const arrow = <span className="text-[var(--muted)]">→</span>;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <span className="mr-1 text-xs font-bold uppercase tracking-wider text-[var(--brand-grey)]">Job progress</span>

      {completedSwms ? (
        <Link
          href={`/dashboard/swms/${completedSwms.id}`}
          className={`${chip} ${p.swmsDone ? STAGE_STYLE.passed : STAGE_STYLE["swms-draft"]}`}
        >
          SWMS{completedSwms.swms_number ?? ""} {p.swmsDone ? "✓" : "(draft)"}
        </Link>
      ) : (
        <span className={`${chip} ${STAGE_STYLE["awaiting-swms"]}`}>Awaiting SWMS</span>
      )}

      {p.inspections.map((ins) => (
        <span key={ins.id} className="inline-flex items-center gap-2">
          {arrow}
          <Link
            href={`/dashboard/inspections/${ins.id}`}
            className={`${chip} ${
              ins.result === "PASS"
                ? STAGE_STYLE.passed
                : ins.result === "FAIL"
                ? STAGE_STYLE["reinspection-due"]
                : ins.status === "Scheduled"
                ? STAGE_STYLE["inspection-scheduled"]
                : STAGE_STYLE.inspecting
            }`}
          >
            {ins.parent_inspection_id ? "Re-inspection" : "Inspection"}{" "}
            {ins.result ||
              (ins.status === "Scheduled"
                ? `booked ${ins.inspection_date ? new Date(ins.inspection_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : ""}`
                : "in progress")}
            {ins.result === "PASS" ? " ✓" : ""}
          </Link>
        </span>
      ))}

      {p.stage === "inspection-due" && (
        <>
          {arrow}
          <Link href={`/dashboard/inspections/new?work_order_id=${workOrderId}`} className={`${chip} ${STAGE_STYLE["inspection-due"]}`}>
            Inspection due — start
          </Link>
        </>
      )}
      {p.stage === "reinspection-due" && p.latest && (
        <>
          {arrow}
          <Link href={`/dashboard/inspections/new?reinspect=${p.latest.id}`} className={`${chip} border-[#9b1c1c] bg-[#9b1c1c] text-white`}>
            Re-inspect
          </Link>
        </>
      )}

      <span className={`ml-auto ${chip} ${STAGE_STYLE[p.stage]}`}>{STAGE_LABEL[p.stage]}</span>
    </div>
  );
}
