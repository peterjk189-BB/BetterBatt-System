import Link from "next/link";

type Job = {
  workOrderId: string;
  woNumber: string;
  site: string;
  customer: string;
  swms: { id: string; status: string } | null;
};

/**
 * Installer-only panel at the top of the schedule: today's jobs, each with a big "Start SWMS" button.
 * The SWMS is the first thing to do on arrival at site, so it's the most prominent thing on the page.
 */
export default function TodaysJobs({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border-2 border-[#f3b73a] bg-[#fff8e6] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#7a5a0f]">Today&apos;s jobs</div>
      <p className="mt-1 text-sm text-[#7a5a0f]">
        When you arrive on site, start your SWMS first. Inspect the site for hazards and sign off before you begin installing.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {jobs.map((j) => (
          <div key={j.workOrderId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 text-[#201f1c]">
            <div className="min-w-0">
              <div className="font-semibold">{j.site || "Site address not set"}</div>
              <div className="text-sm text-[#6b6862]">
                {j.customer ? `${j.customer} · ` : ""}WO {j.woNumber}
              </div>
              <Link href={`/dashboard/work-orders/${j.workOrderId}`} className="text-sm text-[#2563eb] hover:underline">
                View job details
              </Link>
            </div>
            {!j.swms ? (
              <Link
                href={`/dashboard/swms/new?work_order_id=${j.workOrderId}&start=1`}
                className="rounded-xl bg-[#c1272d] px-6 py-4 text-center text-base font-bold text-white shadow hover:bg-[#a51f25]"
              >
                Start SWMS
              </Link>
            ) : j.swms.status === "Completed" ? (
              <Link href={`/dashboard/swms/${j.swms.id}`} className="rounded-xl bg-green-600 px-5 py-3 text-center text-sm font-bold text-white">
                SWMS completed ✓
              </Link>
            ) : (
              <Link href={`/dashboard/swms/${j.swms.id}`} className="rounded-xl bg-[#f59e0b] px-5 py-3 text-center text-sm font-bold text-[#201f1c]">
                Continue SWMS
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
