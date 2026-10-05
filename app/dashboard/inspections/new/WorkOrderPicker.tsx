"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STAGE_LABEL, STAGE_STYLE, jobProgress, type JobStage, type ProgressInspection, type ProgressSwms } from "@/lib/jobProgress";

type WO = {
  id: string;
  wo_number: string;
  po_number: string | null;
  projects: { address: string | null; suburb: string | null; customers: { name: string } | null } | null;
  subcontractors: { name: string } | null;
};

// Jobs ready for an inspection float to the top.
const ORDER: Record<JobStage, number> = {
  "inspection-due": 0,
  "reinspection-due": 1,
  "inspection-scheduled": 2,
  inspecting: 3,
  "swms-draft": 4,
  "awaiting-swms": 5,
  passed: 6,
};

export default function WorkOrderPicker({
  workOrders,
  swms,
  inspections,
}: {
  workOrders: WO[];
  swms: (ProgressSwms & { work_order_id: string })[];
  inspections: (ProgressInspection & { work_order_id: string })[];
}) {
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders
      .map((w) => ({
        w,
        p: jobProgress(
          swms.filter((s) => s.work_order_id === w.id),
          inspections.filter((i) => i.work_order_id === w.id)
        ),
      }))
      .filter(({ w }) => {
        if (!q) return true;
        return [w.wo_number, w.po_number, w.projects?.address, w.projects?.suburb, w.projects?.customers?.name, w.subcontractors?.name]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q));
      })
      .sort((a, b) => ORDER[a.p.stage] - ORDER[b.p.stage]);
  }, [workOrders, swms, inspections, search]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/inspections" className="text-sm text-[var(--muted)] hover:underline">
        &larr; Inspections
      </Link>
      <h1 className="mt-1 text-2xl font-bold">New inspection</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Pick the work order this inspection is for. The address, builder, installer and inspections are filled in from it and the installer&apos;s SWMS.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search work order, address, builder, installer…"
        className="mt-4 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base sm:text-sm"
      />

      <div className="mt-3 flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {rows.map(({ w, p }) => {
          const href =
            p.stage === "reinspection-due" && p.latest
              ? `/dashboard/inspections/new?reinspect=${p.latest.id}`
              : (p.stage === "inspection-scheduled" || p.stage === "inspecting") && p.latest
              ? `/dashboard/inspections/${p.latest.id}`
              : `/dashboard/inspections/new?work_order_id=${w.id}`;
          return (
            <Link key={w.id} href={href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#fafaf8]">
              <div className="min-w-0">
                <div className="font-medium">
                  <span className="font-mono">{w.wo_number}</span>
                  <span className="ml-2">{w.projects?.address || "—"}</span>
                  {w.projects?.suburb && <span className="text-[var(--muted)]">, {w.projects.suburb}</span>}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {[w.projects?.customers?.name, w.subcontractors?.name].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${STAGE_STYLE[p.stage]}`}>{STAGE_LABEL[p.stage]}</span>
            </Link>
          );
        })}
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">No work orders found.</p>}
      </div>
    </div>
  );
}
