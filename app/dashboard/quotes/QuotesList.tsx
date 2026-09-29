"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Project = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  job_type: string;
  category: string | null;
  outcome: "Open" | "Accepted" | "Lost" | "Cancelled";
  suburb: string | null;
  entry_date: string;
  quote_markup: number;
  archived: boolean;
  customers: { name: string } | null;
};

type Line = { project_id: string; part_id: string | null; qty_m2: number };
type Part = {
  id: string;
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
}: {
  initial: Project[];
  lines: Line[];
  parts: Part[];
}) {
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("All");
  const [showArchived, setShowArchived] = useState(false);

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
    .filter((p) => {
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        String(p.quote_number).includes(q) ||
        (p.customers?.name || "").toLowerCase().includes(q) ||
        (p.suburb || "").toLowerCase().includes(q)
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
          placeholder="Search quote #, customer, suburb..."
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
              <th className="px-4 py-2">Suburb</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Outcome</th>
              <th className="px-4 py-2 text-right">Est. total (ex markup)</th>
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
                <td className="px-4 py-2 text-[var(--muted)]">{p.suburb || "—"}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{p.entry_date}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${OUTCOME_COLORS[p.outcome]}`}>
                    {p.outcome}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-medium">
                  {fmtCurrency((totalByProject[p.id] || 0) + Number(p.quote_markup || 0))}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
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
