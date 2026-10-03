"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type WoLine = {
  id: string;
  task_date: string | null;
  note: string | null;
  qty: number;
  work_order_id: string;
  subcontractor_id: string | null;
  work_orders: {
    wo_number: string;
    archived: boolean;
    contractor_id: string | null;
    projects: { quote_number: number; address: string | null; suburb: string | null; customers: { name: string } | null } | null;
    subcontractors: { name: string } | null;
  } | null;
  subcontractors: { name: string } | null;
  labour_items: { code: string; description: string } | null;
};

type Po = {
  id: string;
  po_number: string | null;
  status: "Draft" | "Ordered" | "Received";
  delivery_date: string | null;
  delivery_address: string | null;
  archived: boolean;
  suppliers: { name: string } | null;
};

type WoEvent = {
  kind: "wo";
  date: string;
  id: string;
  workOrderId: string;
  woNumber: string;
  contractorNames: string;
  builderName: string;
  address: string;
  qty: number;
  tasks: string[];
};

type PoEvent = {
  kind: "po";
  date: string;
  id: string;
  poId: string;
  poNumber: string;
  supplierName: string;
  status: Po["status"];
};

type Visit = {
  id: string;
  visit_number: number;
  visit_date: string | null;
  visit_time: string | null;
  status: "Booked" | "Visited" | "Quoted" | "Cancelled";
  customer_name: string | null;
  address: string | null;
  suburb: string | null;
  archived: boolean;
};

type VisitEvent = {
  kind: "visit";
  date: string;
  id: string;
  visitId: string;
  visitNumber: number;
  time: string | null;
  customerName: string;
  address: string;
  status: Visit["status"];
};

type DayEvent = WoEvent | PoEvent | VisitEvent;

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m}${ampm}`;
}

// Local calendar date as YYYY-MM-DD. Deliberately avoids toISOString(), which
// converts to UTC and shifts the date in timezones ahead of UTC (e.g. Sydney).
function toDateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarView({ woLines, pos, visits }: { woLines: WoLine[]; pos: Po[]; visits: Visit[] }) {
  const [centerWeekStart, setCenterWeekStart] = useState(() => mondayOf(new Date()));
  const [showWeekends, setShowWeekends] = useState(true);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    const push = (date: string, ev: DayEvent) => {
      const arr = map.get(date) || [];
      arr.push(ev);
      map.set(date, arr);
    };

    // Group task lines by date + work order so a work order with several line
    // items on the same day shows as one combined calendar entry.
    const woGroups = new Map<
      string,
      {
        date: string;
        workOrderId: string;
        woNumber: string;
        builderName: string;
        address: string;
        qty: number;
        contractorNames: Set<string>;
        tasks: string[];
      }
    >();

    for (const l of woLines) {
      if (!l.task_date || !l.work_orders || l.work_orders.archived) continue;
      const contractorName = l.subcontractors?.name || l.work_orders.subcontractors?.name || "Unassigned";
      const project = l.work_orders.projects;
      const builderName = project?.customers?.name || "—";
      const address = project ? [project.address, project.suburb].filter(Boolean).join(", ") || "—" : "—";
      const task = l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : l.note || "Task";

      const key = `${l.task_date}|${l.work_order_id}`;
      const existing = woGroups.get(key);
      if (existing) {
        existing.qty += Number(l.qty) || 0;
        existing.contractorNames.add(contractorName);
        existing.tasks.push(task);
      } else {
        woGroups.set(key, {
          date: l.task_date,
          workOrderId: l.work_order_id,
          woNumber: l.work_orders.wo_number,
          builderName,
          address,
          qty: Number(l.qty) || 0,
          contractorNames: new Set([contractorName]),
          tasks: [task],
        });
      }
    }

    for (const g of woGroups.values()) {
      push(g.date, {
        kind: "wo",
        date: g.date,
        id: `${g.date}|${g.workOrderId}`,
        workOrderId: g.workOrderId,
        woNumber: g.woNumber,
        contractorNames: Array.from(g.contractorNames).join(", "),
        builderName: g.builderName,
        address: g.address,
        qty: g.qty,
        tasks: g.tasks,
      });
    }

    for (const p of pos) {
      if (!p.delivery_date || p.archived) continue;
      push(p.delivery_date, {
        kind: "po",
        date: p.delivery_date,
        id: p.id,
        poId: p.id,
        poNumber: p.po_number || "—",
        supplierName: p.suppliers?.name || "—",
        status: p.status,
      });
    }

    for (const v of visits) {
      if (!v.visit_date || v.archived) continue;
      push(v.visit_date, {
        kind: "visit",
        date: v.visit_date,
        id: v.id,
        visitId: v.id,
        visitNumber: v.visit_number,
        time: v.visit_time,
        customerName: v.customer_name || "New enquiry",
        address: [v.address, v.suburb].filter(Boolean).join(", ") || "—",
        status: v.status,
      });
    }

    return map;
  }, [woLines, pos, visits]);

  const weekStarts = [centerWeekStart, addDays(centerWeekStart, 7), addDays(centerWeekStart, 14)];
  const todayStr = toDateOnly(new Date());
  const thisWeekStartStr = toDateOnly(mondayOf(new Date()));
  const dayCount = showWeekends ? 7 : 5;

  function shiftWeeks(n: number) {
    setCenterWeekStart((prev) => addDays(prev, n * 7));
  }

  function goToday() {
    setCenterWeekStart(mondayOf(new Date()));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/site-visits/new"
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Add site visit
          </Link>
          <button
            onClick={() => setShowWeekends((s) => !s)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-accent"
          >
            {showWeekends ? "Hide weekends" : "Show weekends"}
          </button>
          <button
            onClick={() => shiftWeeks(-1)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-accent"
          >
            &larr; Previous week
          </button>
          <button
            onClick={goToday}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-accent"
          >
            This week
          </button>
          <button
            onClick={() => shiftWeeks(1)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-accent"
          >
            Next week &rarr;
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" /> Work order task
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> PO delivery
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> Site visit
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {weekStarts.map((weekStart) => {
          const days = Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i));
          const weekEnd = addDays(weekStart, dayCount - 1);
          const isCurrentWeek = toDateOnly(weekStart) === thisWeekStartStr;
          return (
            <div
              key={weekStart.toISOString()}
              className={`overflow-hidden rounded-xl border ${
                isCurrentWeek ? "border-accent" : "border-[var(--border)]"
              }`}
            >
              <div
                className={`flex items-center justify-between px-3 py-1.5 text-xs font-medium uppercase tracking-wide ${
                  isCurrentWeek ? "bg-accent text-white" : "bg-[#f2f0ec] text-[var(--muted)]"
                }`}
              >
                <span>
                  {weekStart.toLocaleDateString("en-AU", { day: "2-digit", month: "short" })} &ndash;{" "}
                  {weekEnd.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                {isCurrentWeek && <span>This week</span>}
              </div>
              <div
                className="grid divide-x divide-[var(--border)]"
                style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }}
              >
                {days.map((d, di) => {
                  const dateStr = toDateOnly(d);
                  const events = eventsByDate.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  return (
                    <div key={dateStr} className={`min-h-[110px] p-2 ${isToday ? "bg-amber-50" : ""}`}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                          {DAY_LABELS[di]}
                        </span>
                        <span className={`text-xs ${isToday ? "font-bold text-accent" : "text-[var(--muted)]"}`}>
                          {d.getDate()}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-col gap-1">
                        {events.length === 0 && <span className="text-xs text-[var(--border)]">&nbsp;</span>}
                        {events.map((ev) => {
                          if (ev.kind === "wo") {
                            return (
                              <Link
                                key={`wo-${ev.id}`}
                                href={`/dashboard/work-orders/${ev.workOrderId}`}
                                title={`${ev.woNumber} — ${ev.builderName} (${ev.address}) — ${ev.tasks.join(", ")} (${ev.contractorNames})`}
                                className="block rounded bg-orange-100 px-1.5 py-1 text-[11px] leading-tight text-orange-900 hover:bg-orange-200"
                              >
                                <div className="truncate font-medium">
                                  {ev.woNumber} · {ev.contractorNames}
                                </div>
                                <div className="truncate text-orange-800">
                                  {ev.builderName} — {ev.address}
                                </div>
                                {ev.qty > 0 && <div className="text-orange-800">{ev.qty} m² to install</div>}
                              </Link>
                            );
                          }
                          if (ev.kind === "po") {
                            return (
                              <Link
                                key={`po-${ev.id}`}
                                href={`/dashboard/purchase-orders/${ev.poId}`}
                                title={`PO ${ev.poNumber} — ${ev.supplierName} (${ev.status})`}
                                className="block truncate rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-900 hover:bg-blue-200"
                              >
                                PO {ev.poNumber} · {ev.supplierName}
                              </Link>
                            );
                          }
                          return (
                            <Link
                              key={`visit-${ev.id}`}
                              href={`/dashboard/site-visits/${ev.visitId}`}
                              title={`Site visit #${ev.visitNumber} — ${ev.customerName} (${ev.address}) — ${ev.status}`}
                              className="block rounded bg-green-100 px-1.5 py-1 text-[11px] leading-tight text-green-900 hover:bg-green-200"
                            >
                              <div className="truncate font-medium">
                                {ev.time ? `${fmtTime(ev.time)} · ` : ""}
                                {ev.customerName}
                              </div>
                              <div className="truncate text-green-800">{ev.address}</div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
