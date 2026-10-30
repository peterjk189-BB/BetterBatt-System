"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { siteAddress } from "@/lib/siteAddress";

type Project = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  job_type: string;
  category: string | null;
  outcome: "Open" | "Accepted" | "Lost" | "Cancelled";
  lot_no?: string | null;
  address?: string | null;
  suburb: string | null;
  entry_date: string;
  quote_markup: number;
  emailed_at?: string | null;
  emailed_to?: string | null;
  archived: boolean;
  customers: { name: string; discount_pct: number | null } | null;
};

type Line = { project_id: string; part_id: string | null; qty_m2: number };
type Part = {
  id: string;
  name: string;
  coverage_m2: number;
  supply_charge_per_pack: number;
  supply_install_rate_per_m2: number;
};

const OUTCOME_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800",
  Accepted: "bg-green-100 text-green-800",
  Lost: "bg-red-100 text-red-800",
  Cancelled: "bg-gray-200 text-gray-700",
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function QuotesList({
  initial,
  lines,
  parts,
  visitsByProject = {},
}: {
  initial: Project[];
  lines: Line[];
  parts: Part[];
  /** Site visits for each quote (latest first): linked to it or booked for the same address. */
  visitsByProject?: Record<string, { id: string; number: number; date: string; status: string }[]>;
}) {
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("All");
  const [showArchived, setShowArchived] = useState(false);
  const [visitFilter, setVisitFilter] = useState<"All" | "Has" | "None">("All");

  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);

  const totalByProject = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of lines) {
      const part = partById[l.part_id || ""];
      if (!part) continue;
      const packs = part.coverage_m2 > 0 ? Math.ceil(l.qty_m2 / part.coverage_m2) : 0;
      const usedForCal = packs * part.coverage_m2;
      const charge = usedForCal * part.supply_install_rate_per_m2;
      map[l.project_id] = (map[l.project_id] || 0) + charge;
    }
    return map;
  }, [lines, partById]);

  const visible = initial
    .filter((p) => p.archived === showArchived)
    .filter((p) => outcomeFilter === "All" || p.outcome === outcomeFilter)
    .filter((p) => visitFilter === "All" || (visitFilter === "Has" ? !!visitsByProject[p.id] : !visitsByProject[p.id]))
    .filter((p) => {
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        String(p.quote_number).includes(q) ||
        (p.customers?.name || "").toLowerCase().includes(q) ||
        siteAddress(p).toLowerCase().includes(q)
      );
    });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quotes</h1>
        <Link
          href="/dashboard/quotes/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          New quote
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <input
          placeholder="Search quote #, customer, address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          {["All", "Open", "Accepted", "Lost", "Cancelled"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select
          value={visitFilter}
          onChange={(e) => setVisitFilter(e.target.value as "All" | "Has" | "None")}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          <option value="All">Site visit: any</option>
          <option value="Has">Has a site visit</option>
          <option value="None">No site visit</option>
        </select>
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="text-sm text-[var(--muted)] underline"
        >
          {showArchived ? "View active" : "View archived"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Quote #</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Job type</th>
              <th className="px-4 py-2">Site address</th>
              <th className="px-4 py-2">Site visit</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Emailed</th>
              <th className="px-4 py-2">Outcome</th>
              <th className="px-4 py-2 text-right">Est. total (ex markup)</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono font-medium">
                  <Link href={`/dashboard/quotes/${p.id}`} className="text-accent hover:underline">
                    Q{p.quote_number}
                  </Link>
                </td>
                <td className="px-4 py-2">{p.customers?.name || "—"}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{p.job_type}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{siteAddress(p) || "—"}</td>
                <td className="px-4 py-2">
                  {(() => {
                    const vs = visitsByProject[p.id];
                    if (!vs?.length) return <span className="text-[var(--muted)]">—</span>;
                    const v = vs[0];
                    const done = v.status !== "Booked";
                    return (
                      <div className="flex flex-col items-start gap-0.5">
                        <Link
                          href={`/dashboard/site-visits/${v.id}`}
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${done ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}
                          title={`SV${v.number}`}
                        >
                          {done ? "Visited" : "Booked"} {new Date(v.date.slice(0, 10) + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        </Link>
                        {vs.length > 1 && <span className="text-[10px] text-[var(--muted)]">+{vs.length - 1} more</span>}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-2 text-[var(--muted)]">{p.entry_date ? new Date(p.entry_date.slice(0, 10) + "T00:00:00").toLocaleDateString("en-AU") : "—"}</td>
                <td className="px-4 py-2 text-xs">
                  {p.emailed_at ? (
                    <>
                      <span className="whitespace-nowrap text-green-700">
                        ✓ {new Date(p.emailed_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      {p.emailed_to && <div className="max-w-[180px] truncate text-[var(--muted)]" title={p.emailed_to}>{p.emailed_to}</div>}
                    </>
                  ) : (
                    <span className="text-[var(--muted)]">Not sent</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${OUTCOME_COLORS[p.outcome]}`}>
                    {p.outcome}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-medium">
                  {fmtCurrency(
                    (totalByProject[p.id] || 0) * (1 - (p.customers?.discount_pct || 0) / 100) +
                      Number(p.quote_markup || 0)
                  )}
                </td>
                <td className="px-4 py-2">
                  <Link
                    href={`/dashboard/work-orders/new?project_id=${p.id}`}
                    className="whitespace-nowrap rounded-md bg-orange-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-600"
                  >
                    Create work order
                  </Link>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-[var(--muted)]">
                  No {showArchived ? "archived" : ""} quotes found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
