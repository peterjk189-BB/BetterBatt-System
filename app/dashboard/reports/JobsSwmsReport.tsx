"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { jobProgress, STAGE_LABEL, STAGE_STYLE, type JobStage } from "@/lib/jobProgress";

export type JobRow = {
  id: string;
  wo_number: number;
  completed_date: string | null;
  entry_date: string | null;
  archived: boolean;
  jsa_received: boolean | null;
  projects: { quote_number: number; address: string | null; suburb: string | null; customers: { name: string } | null } | null;
  subcontractors: { name: string } | null;
};
export type JobSwms = { id: string; status: string; archived?: boolean; swms_number?: number; work_order_id: string };
export type JobInspection = {
  id: string;
  inspection_number: number;
  status: string;
  result: string | null;
  parent_inspection_id: string | null;
  archived?: boolean;
  work_order_id: string;
};
export type JobLine = { work_order_id: string; task_date: string | null };

type SwmsState = "Waiting" | "Draft" | "Completed";
type JobFilter = "All" | "Open" | "Completed";
type SwmsFilter = "All" | SwmsState;

const SWMS_STYLE: Record<SwmsState, string> = {
  Waiting: "bg-[#fde8e8] text-[#b91c1c] border-[#f5b5b5]",
  Draft: "bg-[#fff4d6] text-[#7a5a0f] border-[#f3d48a]",
  Completed: "bg-[#e6f4ea] text-[#1f6b35] border-[#b7dfc2]",
};

const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU") : "—");
const todayStr = () => new Date().toISOString().slice(0, 10);

function daysFrom(d: string | null) {
  if (!d) return null;
  const ms = new Date(todayStr() + "T00:00:00").getTime() - new Date(d + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

export default function JobsSwmsReport({
  workOrders,
  swms,
  inspections,
  lines,
}: {
  workOrders: JobRow[];
  swms: JobSwms[];
  inspections: JobInspection[];
  lines: JobLine[];
}) {
  const [jobFilter, setJobFilter] = useState<JobFilter>("All");
  const [swmsFilter, setSwmsFilter] = useState<SwmsFilter>("All");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const swmsBy = new Map<string, JobSwms[]>();
    swms.forEach((s) => swmsBy.set(s.work_order_id, [...(swmsBy.get(s.work_order_id) ?? []), s]));
    const insBy = new Map<string, JobInspection[]>();
    inspections.forEach((i) => insBy.set(i.work_order_id, [...(insBy.get(i.work_order_id) ?? []), i]));
    const firstDate = new Map<string, string>();
    lines.forEach((l) => {
      if (!l.task_date) return;
      const cur = firstDate.get(l.work_order_id);
      if (!cur || l.task_date < cur) firstDate.set(l.work_order_id, l.task_date);
    });

    return workOrders
      .filter((w) => !w.archived)
      .map((w) => {
        const mine = swmsBy.get(w.id) ?? [];
        const p = jobProgress(mine, insBy.get(w.id) ?? []);
        const live = mine.filter((s) => !s.archived);
        const state: SwmsState = live.some((s) => s.status === "Completed") ? "Completed" : live.length ? "Draft" : "Waiting";
        const open = !w.completed_date;
        const start = firstDate.get(w.id) ?? null;
        const customer = w.projects?.customers?.name ?? "";
        const site = [w.projects?.address, w.projects?.suburb].filter(Boolean).join(", ");
        return {
          w,
          open,
          state,
          stage: p.stage as JobStage,
          swmsId: (live.find((s) => s.status === "Completed") ?? live[0])?.id ?? null,
          swmsNo: (live.find((s) => s.status === "Completed") ?? live[0])?.swms_number ?? null,
          start,
          customer,
          site,
          contractor: w.subcontractors?.name ?? "",
        };
      })
      .sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999") || a.w.wo_number - b.w.wo_number);
  }, [workOrders, swms, inspections, lines]);

  const tiles = useMemo(() => {
    const open = rows.filter((r) => r.open);
    return {
      waiting: open.filter((r) => r.state === "Waiting").length,
      draft: open.filter((r) => r.state === "Draft").length,
      ready: open.filter((r) => r.state === "Completed").length,
      doneNoSwms: rows.filter((r) => !r.open && r.state !== "Completed").length,
    };
  }, [rows]);

  const visible = rows.filter((r) => {
    if (jobFilter === "Open" && !r.open) return false;
    if (jobFilter === "Completed" && r.open) return false;
    if (swmsFilter !== "All" && r.state !== swmsFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !`wo${r.w.wo_number} ${r.customer} ${r.site} ${r.contractor}`.toLowerCase().includes(q)) return false;
    return true;
  });

  function exportCsv() {
    const head = ["Work order", "Job", "Customer", "Site", "Contractor", "First task date", "SWMS", "Job progress"];
    const body = visible.map((r) => [
      `WO${r.w.wo_number}`,
      r.open ? "Open" : "Completed",
      r.customer,
      r.site,
      r.contractor,
      r.start ?? "",
      r.state,
      STAGE_LABEL[r.stage],
    ]);
    const csv = [head, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobs-swms-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm ${active ? "bg-[#201f1c] text-white" : "text-[var(--muted)]"}`;

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Open - waiting on SWMS" value={tiles.waiting} tone="red" onClick={() => { setJobFilter("Open"); setSwmsFilter("Waiting"); }} />
        <Tile label="Open - SWMS in draft" value={tiles.draft} tone="amber" onClick={() => { setJobFilter("Open"); setSwmsFilter("Draft"); }} />
        <Tile label="Open - SWMS done" value={tiles.ready} tone="green" onClick={() => { setJobFilter("Open"); setSwmsFilter("Completed"); }} />
        <Tile label="Completed - no SWMS on file" value={tiles.doneNoSwms} tone="red" onClick={() => { setJobFilter("Completed"); setSwmsFilter("All"); }} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
          {(["All", "Open", "Completed"] as JobFilter[]).map((f) => (
            <button key={f} onClick={() => setJobFilter(f)} className={pill(jobFilter === f)}>
              {f === "All" ? "All jobs" : f}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
          {(["All", "Waiting", "Draft", "Completed"] as SwmsFilter[]).map((f) => (
            <button key={f} onClick={() => setSwmsFilter(f)} className={pill(swmsFilter === f)}>
              {f === "All" ? "Any SWMS" : f === "Waiting" ? "Waiting on SWMS" : `SWMS ${f.toLowerCase()}`}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search WO #, customer, site, contractor..."
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <button onClick={exportCsv} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Work order</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Site</th>
              <th className="px-4 py-2">Contractor</th>
              <th className="px-4 py-2">First task</th>
              <th className="px-4 py-2">Job</th>
              <th className="px-4 py-2">SWMS</th>
              <th className="px-4 py-2">Job progress</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
                  No jobs match these filters.
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const d = r.open && r.state === "Waiting" ? daysFrom(r.start) : null;
              const overdue = d !== null && d >= 0;
              return (
                <tr key={r.w.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/dashboard/work-orders/${r.w.id}`} className="text-accent hover:underline">
                      WO{r.w.wo_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.customer || "—"}</td>
                  <td className="px-4 py-2">{r.site || "—"}</td>
                  <td className="px-4 py-2">{r.contractor || "—"}</td>
                  <td className="px-4 py-2">
                    {fmtDate(r.start)}
                    {overdue && <span className="ml-2 text-xs font-semibold text-[#b91c1c]">{d === 0 ? "today" : `${d}d ago`}</span>}
                  </td>
                  <td className="px-4 py-2">{r.open ? "Open" : `Completed ${fmtDate(r.w.completed_date)}`}</td>
                  <td className="px-4 py-2">
                    {r.swmsId ? (
                      <Link href={`/dashboard/swms/${r.swmsId}`} className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${SWMS_STYLE[r.state]}`}>
                        {r.state}{r.swmsNo ? ` (SWMS${r.swmsNo})` : ""}
                      </Link>
                    ) : (
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${SWMS_STYLE.Waiting}`}>Waiting on SWMS</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLE[r.stage]}`}>{STAGE_LABEL[r.stage]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted)]">
        A job is Open until its Completed date is set on the work order. Archived work orders are left out. Click a tile to filter the list.
      </p>
    </div>
  );
}

function Tile({ label, value, tone, onClick }: { label: string; value: number; tone: "red" | "amber" | "green"; onClick: () => void }) {
  const color = tone === "red" ? "text-[#b91c1c]" : tone === "amber" ? "text-[#7a5a0f]" : "text-[#1f6b35]";
  return (
    <button onClick={onClick} className="rounded-xl border border-[var(--border)] bg-white p-4 text-left hover:border-accent">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </button>
  );
}
