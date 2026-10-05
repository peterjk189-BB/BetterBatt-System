"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STATUS_STYLES, sectionsSummary, type InspectionResult, type InspectionStatus } from "@/lib/inspections";

type Row = {
  id: string;
  inspection_number: number;
  inspection_date: string;
  status: InspectionStatus;
  result: InspectionResult | null;
  builder_name: string | null;
  site_address: string | null;
  suburb: string | null;
  include_foil: boolean;
  include_wall: boolean;
  include_ceiling: boolean;
  archived: boolean;
  work_orders: { wo_number: string } | null;
  projects: { quote_number: number } | null;
};

const FILTERS = ["All", "Draft", "Completed", "PASS", "FAIL"] as const;

const RESULT_STYLES: Record<string, string> = {
  PASS: "bg-[#e6f4ea] text-[#1f6b35] border-[#b7dfc2]",
  FAIL: "bg-[#fde8e8] text-[#9b1c1c] border-[#f5b5b5]",
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function InspectionsList({ initial }: { initial: Row[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial
      .filter((r) => r.archived === showArchived)
      .filter((r) => filter === "All" || r.status === filter || r.result === filter)
      .filter((r) => {
        if (!q) return true;
        return [`ins${r.inspection_number}`, r.builder_name, r.site_address, r.suburb]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q));
      });
  }, [initial, search, filter, showArchived]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of initial) {
      if (r.archived) continue;
      c[r.status] = (c[r.status] || 0) + 1;
      if (r.result) c[r.result] = (c[r.result] || 0) + 1;
    }
    return c;
  }, [initial]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inspections</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Foil, wall and ceiling inspection reports, with photos of anything rectified.</p>
        </div>
        <Link
          href="/dashboard/inspections/new"
          className="rounded-lg bg-[var(--brand-gold)] px-4 py-2.5 text-sm font-semibold text-[#201f1c] hover:brightness-95"
        >
          New inspection
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f;
          const n = f === "All" ? undefined : counts[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                active ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {f}
              {n ? <span className="ml-1.5 tabular-nums opacity-70">{n}</span> : null}
            </button>
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search address, builder…"
          className="ml-auto w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm sm:w-auto"
        />
        <button onClick={() => setShowArchived((s) => !s)} className="text-sm text-[var(--muted)] hover:underline">
          {showArchived ? "Show active" : "Show archived"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f6f5f2] text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2.5">Report</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Covers</th>
              <th className="px-4 py-2.5">Site</th>
              <th className="px-4 py-2.5">Linked</th>
              <th className="px-4 py-2.5">Result</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-[#fafaf8]">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/inspections/${r.id}`} className="font-semibold text-accent hover:underline">
                    INS{r.inspection_number}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">{fmtDate(r.inspection_date)}</td>
                <td className="px-4 py-3">{sectionsSummary(r)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.site_address || r.builder_name || "—"}</div>
                  {r.suburb && <div className="text-xs text-[var(--muted)]">{r.suburb}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {r.work_orders?.wo_number ? `WO ${r.work_orders.wo_number}` : r.projects?.quote_number ? `Q${r.projects.quote_number}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.result ? (
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${RESULT_STYLES[r.result]}`}>{r.result}</span>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[var(--muted)]">
                  No inspections{search ? " match that search" : showArchived ? " archived" : " yet"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
