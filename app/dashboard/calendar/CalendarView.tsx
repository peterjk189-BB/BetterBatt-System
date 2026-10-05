"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

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
  assigned_to: string | null;
  profiles?: { full_name: string | null } | null;
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
  assignedToName: string | null;
};

type Inspection = {
  id: string;
  inspection_number: number;
  inspection_date: string | null;
  inspection_time: string | null;
  status: "Scheduled" | "Draft" | "Completed";
  result: "PASS" | "FAIL" | null;
  site_address: string | null;
  suburb: string | null;
  builder_name: string | null;
  installer_name: string | null;
  parent_inspection_id: string | null;
  archived: boolean;
  work_orders: { wo_number: string } | null;
};

type InspectionEvent = {
  kind: "inspection";
  date: string;
  id: string;
  inspectionId: string;
  number: number;
  time: string | null;
  status: Inspection["status"];
  result: Inspection["result"];
  address: string;
  builderName: string;
  woNumber: string | null;
  reinspection: boolean;
};

type DayEvent = WoEvent | PoEvent | VisitEvent | InspectionEvent;

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

export default function CalendarView({
  woLines,
  pos,
  visits,
  inspections = [],
  installerNote,
}: {
  woLines: WoLine[];
  pos: Po[];
  visits: Visit[];
  /** Site inspections (office only). Booked/in-progress ones show in bold red and can be moved to another day. */
  inspections?: Inspection[];
  /** Set for an installer (real or sample preview): a short note explaining the calendar is scoped to just their jobs, and hides the office-only "Add site visit" shortcut. */
  installerNote?: string | null;
}) {
  const [centerWeekStart, setCenterWeekStart] = useState(() => mondayOf(new Date()));
  const [showWeekends, setShowWeekends] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // Inspection dates moved here, shown straight away while the save happens.
  const [movedDates, setMovedDates] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  async function moveInspection(id: string, number: number, from: string, to: string) {
    if (!to || to === from) return;
    setMoveError(null);
    setMovedDates((m) => ({ ...m, [id]: to }));
    const { error } = await supabase.from("inspections").update({ inspection_date: to }).eq("id", id);
    if (error) {
      setMovedDates((m) => ({ ...m, [id]: from }));
      setMoveError(`Couldn't move INS${number}: ${error.message}`);
      return;
    }
    logAudit(supabase, { eventType: "update", entityType: "Inspection", entityId: id, entityLabel: `INS${number}`, details: `Moved from ${from} to ${to}` });
    router.refresh();
  }

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
        assignedToName: v.profiles?.full_name || null,
      });
    }

    for (const ins of inspections) {
      const date = movedDates[ins.id] || ins.inspection_date;
      if (!date || ins.archived) continue;
      push(date, {
        kind: "inspection",
        date,
        id: ins.id,
        inspectionId: ins.id,
        number: ins.inspection_number,
        time: ins.inspection_time,
        status: ins.status,
        result: ins.result,
        address: [ins.site_address, ins.suburb].filter(Boolean).join(", ") || "—",
        builderName: ins.builder_name || "",
        woNumber: ins.work_orders?.wo_number || null,
        reinspection: !!ins.parent_inspection_id,
      });
    }

    // Booked inspections sit at the top of each day so they stand out.
    for (const arr of map.values()) arr.sort((a, b) => (a.kind === "inspection" ? 0 : 1) - (b.kind === "inspection" ? 0 : 1));

    return map;
  }, [woLines, pos, visits, inspections, movedDates]);

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
          {!installerNote && (
            <Link
              href="/dashboard/site-visits/new"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add site visit
            </Link>
          )}
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

      {installerNote ? (
        <div className="mt-3 rounded-lg border border-[#f3d48a] bg-[#fff8e6] px-3 py-2 text-sm text-[#7a5a0f]">{installerNote}</div>
      ) : (
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
          <span className="flex items-center gap-1.5 font-bold text-[#b91c1c]">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#b91c1c]" /> Inspection — drag to another day, or tap Move
          </span>
        </div>
      )}
      {moveError && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{moveError}</div>}

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
                    <div
                      key={dateStr}
                      className={`min-h-[110px] p-2 ${isToday ? "bg-amber-50" : ""} ${
                        dragId && dropDate === dateStr ? "bg-red-50 ring-2 ring-inset ring-[#b91c1c]" : ""
                      }`}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        if (dropDate !== dateStr) setDropDate(dateStr);
                      }}
                      onDragLeave={() => setDropDate((d) => (d === dateStr ? null : d))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/inspection-id") || dragId;
                        const ins = inspections.find((x) => x.id === id);
                        setDragId(null);
                        setDropDate(null);
                        if (ins) moveInspection(ins.id, ins.inspection_number, movedDates[ins.id] || ins.inspection_date || "", dateStr);
                      }}
                    >
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
                          if (ev.kind === "inspection") {
                            return (
                              <InspectionChip
                                key={`ins-${ev.id}`}
                                ev={ev}
                                onDragStart={() => setDragId(ev.inspectionId)}
                                onDragEnd={() => {
                                  setDragId(null);
                                  setDropDate(null);
                                }}
                                onMove={(to) => moveInspection(ev.inspectionId, ev.number, ev.date, to)}
                              />
                            );
                          }
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
                              title={`Site visit #${ev.visitNumber} — ${ev.customerName} (${ev.address}) — ${ev.status}${
                                ev.assignedToName ? ` — ${ev.assignedToName}` : ""
                              }`}
                              className="block rounded bg-green-100 px-1.5 py-1 text-[11px] leading-tight text-green-900 hover:bg-green-200"
                            >
                              <div className="truncate font-medium">
                                {ev.time ? `${fmtTime(ev.time)} · ` : ""}
                                {ev.customerName}
                              </div>
                              <div className="truncate text-green-800">{ev.address}</div>
                              {ev.assignedToName && <div className="truncate text-green-800">{ev.assignedToName}</div>}
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

function InspectionChip({
  ev,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  ev: InspectionEvent;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: string) => void;
}) {
  const [moving, setMoving] = useState(false);
  const done = ev.status === "Completed" || !!ev.result;
  const label = ev.result ? ev.result : ev.status === "Scheduled" ? "Booked" : "In progress";

  return (
    <div
      draggable={!done}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/inspection-id", ev.inspectionId);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`rounded px-1.5 py-1 text-[11px] leading-tight ${
        done
          ? ev.result === "PASS"
            ? "border border-green-300 bg-green-50 text-green-900"
            : "border border-red-300 bg-red-50 text-red-900"
          : "cursor-grab border-2 border-[#b91c1c] bg-[#fde8e8] font-bold text-[#b91c1c] active:cursor-grabbing"
      }`}
      title={`${ev.reinspection ? "Re-inspection" : "Inspection"} INS${ev.number} — ${ev.builderName} (${ev.address})${
        ev.woNumber ? ` — WO ${ev.woNumber}` : ""
      }`}
    >
      <Link href={`/dashboard/inspections/${ev.inspectionId}`} className="block hover:underline">
        <div className="truncate uppercase">
          {ev.time ? `${fmtTime(ev.time)} · ` : ""}
          {ev.reinspection ? "Re-inspection" : "Inspection"} · {label}
        </div>
        <div className="truncate">{ev.address}</div>
        {ev.builderName && <div className={`truncate ${done ? "" : "font-semibold"}`}>{ev.builderName}</div>}
      </Link>
      {!done &&
        (moving ? (
          <input
            type="date"
            autoFocus
            defaultValue={ev.date}
            onChange={(e) => {
              if (e.target.value) {
                onMove(e.target.value);
                setMoving(false);
              }
            }}
            onBlur={() => setMoving(false)}
            className="mt-1 w-full rounded border border-[#b91c1c] bg-white px-1 py-0.5 text-[12px] font-normal text-[#201f1c]"
            aria-label="Move inspection to"
          />
        ) : (
          <button
            type="button"
            onClick={() => setMoving(true)}
            className="mt-1 rounded border border-[#b91c1c] bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#b91c1c]"
          >
            Move
          </button>
        ))}
    </div>
  );
}
