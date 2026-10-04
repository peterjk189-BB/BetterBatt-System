"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STATUS_STYLES, measuredSummary, normaliseChecklist, type SiteVisit } from "@/lib/siteVisit";

type Row = Pick<
  SiteVisit,
  "id" | "visit_number" | "visit_date" | "visit_time" | "status" | "visit_type" | "customer_name" | "phone" | "address" | "suburb" | "checklist" | "project_id" | "archived" | "assigned_to"
> & { projects: { quote_number: number } | null; profiles: { full_name: string | null } | null };

const FILTERS = ["All", "Booked", "Visited", "Quoted", "Cancelled"] as const;

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function SiteVisitsList({ initial, photoCounts }: { initial: Row[]; photoCounts: Record<string, number> }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial
      .filter((v) => v.archived === showArchived)
      .filter((v) => filter === "All" || v.status === filter)
      .filter((v) => {
        if (!q) return true;
        return [`sv${v.visit_number}`, v.customer_name, v.address, v.suburb, v.phone]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q));
      });
  }, [initial, search, filter, showArchived]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of initial) if (!v.archived) c[v.status] = (c[v.status] || 0) + 1;
    return c;
  }, [initial]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Site visits</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            The on-site checklist: roof, access, measurements and photos, ready to build a quote from.
          </p>
        </div>
        <Link
          href="/dashboard/site-visits/new"
          className="rounded-lg bg-[var(--brand-gold)] px-4 py-2.5 text-sm font-semibold text-[#201f1c] hover:brightness-95"
        >
          New site visit
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
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <input
          type="search"
          placeholder="Search customer, address, suburb, SV#..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button onClick={() => setShowArchived((v) => !v)} className="text-sm text-[var(--muted)] underline">
          {showArchived ? "View active" : "View archived"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((v) => {
          const chips = measuredSummary(normaliseChecklist(v.checklist));
          const photos = photoCounts[v.id] || 0;
          return (
            <Link
              key={v.id}
              href={`/dashboard/site-visits/${v.id}`}
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--brand-gold-dark)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-[var(--muted)]">SV{v.visit_number}</div>
                  <div className="truncate text-base font-semibold">{v.customer_name || "No customer name"}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[v.status] || ""}`}>
                  {v.status}
                </span>
              </div>
              <div className="text-sm text-[var(--muted)]">
                {[v.address, v.suburb].filter(Boolean).join(", ") || "No address yet"}
              </div>
              <div className="text-sm">
                {fmtDate(v.visit_date)}
                {v.visit_time ? ` · ${fmtTime(v.visit_time)}` : ""}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--muted)]">{v.visit_type}</span>
                {chips.map((c) => (
                  <span key={c} className="rounded bg-[#fff4d6] px-1.5 py-0.5 font-medium text-[#7a5a0f]">
                    {c}
                  </span>
                ))}
                {photos > 0 && <span className="text-[var(--muted)]">{photos} photo{photos === 1 ? "" : "s"}</span>}
                {v.profiles?.full_name && (
                  <span className="rounded bg-[#eef2ff] px-1.5 py-0.5 font-medium text-[#3b4ba8]">{v.profiles.full_name}</span>
                )}
                {v.projects && <span className="ml-auto font-mono text-[#1f6b35]">Q{v.projects.quote_number}</span>}
              </div>
            </Link>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)] md:col-span-2 xl:col-span-3">
            {initial.length === 0
              ? "No site visits yet. When a customer calls or emails, book the visit with New site visit and fill in the checklist on site."
              : "No site visits match this filter."}
          </div>
        )}
      </div>
    </div>
  );
}
