"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

type WoLine = {
  id: string;
  task_date: string | null;
  task_time?: string | null;
  note: string | null;
  qty: number;
  completed?: boolean | null;
  work_order_id: string;
  subcontractor_id: string | null;
  work_orders: {
    wo_number: string;
    archived: boolean;
    completed_date?: string | null;
    contractor_id: string | null;
    projects: { quote_number: number; address: string | null; suburb: string | null; customers: { name: string } | null } | null;
    subcontractors: { name: string } | null;
  } | null;
  subcontractors: { name: string } | null;
  labour_items: { code: string; description: string } | null;
  parts?: { name: string; is_stock_item?: boolean | null } | null;
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
  time: string | null;
  subIds: string[];
  /** The work order is marked complete (completed date set, or every task that day ticked off). */
  complete: boolean;
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
  result: "PASS" | "IN PROGRESS" | "FAIL" | null;
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

export type CrmCalendarTask = {
  id: string;
  title: string;
  kind: string;
  due_date: string;
  lead_id: string | null;
  customer_id: string | null;
  leads?: { name: string } | null;
  customers?: { name: string } | null;
};

type CrmEvent = {
  kind: "crm";
  date: string;
  id: string;
  title: string;
  taskKind: string;
  href: string;
  who: string;
};

type StockDelivery = {
  id: string;
  wo_number: string;
  stock_delivery_date: string | null;
  projects: {
    lot_no: string | null;
    address: string | null;
    suburb: string | null;
    customers: { name: string } | null;
  } | null;
  work_order_lines?: { parts: { is_stock_item: boolean | null; suppliers: { name: string } | null } | null }[] | null;
};

type DeliveryEvent = {
  kind: "delivery";
  date: string;
  id: string;
  workOrderId: string;
  woNumber: string;
  customerName: string;
  address: string;
  suppliers: string;
};

type InvoiceDelivery = {
  id: string;
  invoice_number: number;
  delivery_method: string | null;
  delivery_date: string | null;
  delivery_address: string | null;
  site_address: string | null;
  customers: { name: string } | null;
};

type InvoiceDeliveryEvent = {
  kind: "invdelivery";
  date: string;
  id: string;
  invoiceId: string;
  invoiceNumber: number;
  pickup: boolean;
  customerName: string;
  address: string;
};

type DayEvent = WoEvent | PoEvent | VisitEvent | InspectionEvent | CrmEvent | DeliveryEvent | InvoiceDeliveryEvent;

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

export type TimeAway = {
  id: string;
  user_id: string | null;
  subcontractor_id: string | null;
  all_staff?: boolean;
  kind: "Holiday" | "Appointment" | "Sick" | "Training" | "Other" | "Closed";
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
};
export type AwayPerson = { key: string; name: string; group: string };

const AWAY_KINDS = ["Holiday", "Appointment", "Sick", "Training", "Other", "Closed"] as const;
const AWAY_STYLE: Record<string, string> = {
  Holiday: "bg-teal-100 text-teal-900 border-teal-300 hover:bg-teal-200",
  Appointment: "bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200",
  Sick: "bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200",
  Training: "bg-sky-100 text-sky-900 border-sky-300 hover:bg-sky-200",
  Other: "bg-gray-200 text-gray-900 border-gray-300 hover:bg-gray-300",
  Closed: "bg-red-700 text-white border-red-800 hover:bg-red-800",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarView({
  woLines,
  pos,
  visits,
  inspections = [],
  crmTasks = [],
  stockDeliveries = [],
  invoiceDeliveries = [],
  bookingErrors = [],
  timeAway = [],
  awayPeople = [],
  installerNote,
}: {
  woLines: WoLine[];
  pos: Po[];
  visits: Visit[];
  /** Site inspections (office only). Booked/in-progress ones show in bold red and can be moved to another day. */
  inspections?: Inspection[];
  /** The signed-in office user's open CRM follow-ups; each links to its CRM file. */
  crmTasks?: CrmCalendarTask[];
  stockDeliveries?: StockDelivery[];
  invoiceDeliveries?: InvoiceDelivery[];
  /** Work orders whose due inspection couldn't be booked automatically, with the reason. */
  bookingErrors?: string[];
  /** Holidays / appointments for office staff and contractors (office view only). */
  timeAway?: TimeAway[];
  awayPeople?: AwayPerson[];
  /** Set for an installer (real or sample preview): a short note explaining the calendar is scoped to just their jobs, and hides the office-only "Add site visit" shortcut. */
  installerNote?: string | null;
}) {
  const [centerWeekStart, setCenterWeekStart] = useState(() => mondayOf(new Date()));
  // Weekends are hidden by default; the choice is remembered on this device.
  const [showWeekends, setShowWeekendsState] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("bb-cal-weekends") === "1") setShowWeekendsState(true);
    } catch {}
  }, []);
  const setShowWeekends = (fn: (s: boolean) => boolean) =>
    setShowWeekendsState((prev) => {
      const next = fn(prev);
      try { localStorage.setItem("bb-cal-weekends", next ? "1" : "0"); } catch {}
      return next;
    });
  // How many weeks are on screen (3 by default); the choice is remembered on this device.
  const [weeksShown, setWeeksShownState] = useState(3);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem("bb-cal-weeks"));
      if ([3, 4, 6, 8, 12].includes(n)) setWeeksShownState(n);
    } catch {}
  }, []);
  const setWeeksShown = (n: number) => {
    setWeeksShownState(n);
    try { localStorage.setItem("bb-cal-weeks", String(n)); } catch {}
  };
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // Inspection dates moved here, shown straight away while the save happens.
  const [movedDates, setMovedDates] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // Work order dates moved here ("from|workOrderId" -> new date), shown straight away while the save happens.
  const [movedWo, setMovedWo] = useState<Record<string, string>>({});
  const [woDrag, setWoDrag] = useState<{ woId: string; from: string; label: string } | null>(null);
  useEffect(() => {
    setMovedWo({});
  }, [woLines]);

  // Which kinds of entry are hidden, remembered on this device so the calendar stays how you left it.
  const [hiddenKinds, setHiddenKinds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("calendar-hidden-kinds");
      if (raw) setHiddenKinds(JSON.parse(raw));
    } catch {}
  }, []);
  function toggleKind(k: string) {
    setHiddenKinds((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      try {
        localStorage.setItem("calendar-hidden-kinds", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  async function moveInspection(id: string, number: number, from: string, to: string) {
    if (!to || to === from) return;
    const closed = closedOn(to);
    if (closed && !window.confirm(`The business is closed on that day${closed.note ? " (" + closed.note + ")" : ""}. Move it there anyway?`)) return;
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

  async function moveWorkOrder(woId: string, label: string, from: string, to: string, subIds: string[]) {
    if (!to || to === from) return;
    const closed = closedOn(to);
    if (closed && !window.confirm(`The business is closed on that day${closed.note ? " (" + closed.note + ")" : ""}. Move it there anyway?`)) return;
    setMoveError(null);
    setMovedWo((m) => ({ ...m, [`${from}|${woId}`]: to }));
    const { error } = await supabase.from("work_order_lines").update({ task_date: to }).eq("work_order_id", woId).eq("task_date", from);
    if (error) {
      setMovedWo((m) => {
        const n = { ...m };
        delete n[`${from}|${woId}`];
        return n;
      });
      setMoveError(`Couldn't move ${label}: ${error.message}`);
      return;
    }
    logAudit(supabase, { eventType: "update", entityType: "work_order", entityId: woId, entityLabel: label, details: `Job date moved from ${from} to ${to}` });
    if (subIds.length > 0) {
      fetch("/api/work-orders/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_order_id: woId, items: subIds.map((id) => ({ subcontractor_id: id, dates: [to] })) }),
      }).catch(() => {});
    }
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
        time: string | null;
        subIds: Set<string>;
        woDone: boolean;
        allTicked: boolean;
      }
    >();

    for (const l of woLines) {
      if (!l.task_date || !l.work_orders || l.work_orders.archived) continue;
      const contractorName = l.subcontractors?.name || l.work_orders.subcontractors?.name || "Unassigned";
      const project = l.work_orders.projects;
      const builderName = project?.customers?.name || "—";
      const address = project ? [project.address, project.suburb].filter(Boolean).join(", ") || "—" : "—";
      const task = l.parts?.name || (l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : l.note || "Task");

      // Non-stock items (delivery, tape, etc.) are not installed m², so leave them out of the total.
      const lineQty = l.parts?.is_stock_item === false ? 0 : Number(l.qty) || 0;
      const shownDate = movedWo[`${l.task_date}|${l.work_order_id}`] || l.task_date;
      const sid = l.subcontractor_id || l.work_orders.contractor_id;
      const key = `${shownDate}|${l.work_order_id}`;
      const existing = woGroups.get(key);
      if (existing) {
        existing.qty += lineQty;
        existing.contractorNames.add(contractorName);
        existing.tasks.push(task);
        if (!l.completed) existing.allTicked = false;
        if (sid) existing.subIds.add(sid);
        if (l.task_time && (!existing.time || l.task_time < existing.time)) existing.time = l.task_time;
      } else {
        woGroups.set(key, {
          date: shownDate,
          workOrderId: l.work_order_id,
          woNumber: l.work_orders.wo_number,
          builderName,
          address,
          qty: lineQty,
          contractorNames: new Set([contractorName]),
          tasks: [task],
          time: l.task_time || null,
          subIds: new Set(sid ? [sid] : []),
          woDone: !!l.work_orders.completed_date,
          allTicked: !!l.completed,
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
        time: g.time,
        subIds: Array.from(g.subIds),
        complete: g.woDone || g.allTicked,
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

    for (const d of stockDeliveries) {
      if (!d.stock_delivery_date) continue;
      const lot = d.projects?.lot_no?.trim();
      push(d.stock_delivery_date, {
        kind: "delivery",
        date: d.stock_delivery_date,
        id: d.id,
        workOrderId: d.id,
        woNumber: d.wo_number,
        customerName: d.projects?.customers?.name || "—",
        suppliers: Array.from(
          new Set(
            (d.work_order_lines ?? [])
              .filter((l) => l.parts && l.parts.is_stock_item !== false && l.parts.suppliers?.name)
              .map((l) => l.parts!.suppliers!.name)
          )
        ).join(", "),
        address:
          [lot ? (/^lot\b/i.test(lot) ? lot : `Lot ${lot}`) : null, d.projects?.address, d.projects?.suburb]
            .filter(Boolean)
            .join(", ") || "—",
      });
    }

    for (const d of invoiceDeliveries) {
      if (!d.delivery_date) continue;
      push(d.delivery_date, {
        kind: "invdelivery",
        date: d.delivery_date,
        id: d.id,
        invoiceId: d.id,
        invoiceNumber: d.invoice_number,
        pickup: d.delivery_method === "pickup",
        customerName: d.customers?.name || "—",
        address: d.delivery_address?.replace(/\s*\n\s*/g, ", ") || d.site_address?.replace(/\s*\n\s*/g, ", ") || "—",
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

    for (const t of crmTasks) {
      push(t.due_date, {
        kind: "crm",
        date: t.due_date,
        id: t.id,
        title: t.title,
        taskKind: t.kind,
        href: t.lead_id
          ? `/dashboard/crm/leads/${t.lead_id}`
          : t.customer_id
          ? `/dashboard/crm/accounts/${t.customer_id}`
          : "/dashboard/crm?tab=tasks",
        who: t.customers?.name || t.leads?.name || "",
      });
    }

    // Booked inspections sit at the top of each day so they stand out.
    for (const arr of map.values()) arr.sort((a, b) => (a.kind === "inspection" ? 0 : 1) - (b.kind === "inspection" ? 0 : 1));

    // Within each day: all-day items first, then timed items (site visits, inspections) in time order.
    map.forEach((arr) => {
      const t = (e: DayEvent) => ((e as { time?: string | null }).time || "");
      arr.sort((a, b) => {
        const ta = t(a);
        const tb = t(b);
        if (!ta && !tb) return 0;
        if (!ta) return -1;
        if (!tb) return 1;
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });
    });
    return map;
  }, [woLines, pos, visits, inspections, crmTasks, stockDeliveries, invoiceDeliveries, movedDates, movedWo]);

  // ---- Time away (holidays, appointments) ----
  const [awayEdit, setAwayEdit] = useState<
    null | { id: string | null; who: string; kind: string; from: string; to: string; start: string; end: string; note: string }
  >(null);
  const [awayBusy, setAwayBusy] = useState(false);
  const [awayError, setAwayError] = useState<string | null>(null);
  const awayNameByKey = useMemo(() => Object.fromEntries(awayPeople.map((p) => [p.key, p.name])), [awayPeople]);
  const awayKey = (a: TimeAway) => (a.all_staff ? "all" : a.user_id ? `u:${a.user_id}` : `s:${a.subcontractor_id}`);
  const closedOn = (dateStr: string) => timeAway.find((a) => a.kind === "Closed" && a.start_date <= dateStr && a.end_date >= dateStr);
  const awayOn = (dateStr: string) => timeAway.filter((a) => a.start_date <= dateStr && a.end_date >= dateStr);

  function openAway(a?: TimeAway, date?: string) {
    setAwayError(null);
    const day = date || todayStr;
    setAwayEdit(
      a
        ? { id: a.id, who: awayKey(a), kind: a.kind, from: a.start_date, to: a.end_date, start: a.start_time?.slice(0, 5) || "", end: a.end_time?.slice(0, 5) || "", note: a.note || "" }
        : { id: null, who: awayPeople[0]?.key || "", kind: "Holiday", from: day, to: day, start: "", end: "", note: "" }
    );
  }

  async function saveAway() {
    if (!awayEdit) return;
    if (!awayEdit.who) return setAwayError("Choose who is away.");
    if (!awayEdit.from || !awayEdit.to) return setAwayError("Choose the dates.");
    if (awayEdit.to < awayEdit.from) return setAwayError("The last day can't be before the first day.");
    setAwayBusy(true);
    setAwayError(null);
    const row = {
      ...(awayEdit.who === "all" ? { all_staff: true } : {}),
      user_id: awayEdit.who.startsWith("u:") ? awayEdit.who.slice(2) : null,
      subcontractor_id: awayEdit.who.startsWith("s:") ? awayEdit.who.slice(2) : null,
      kind: awayEdit.kind,
      start_date: awayEdit.from,
      end_date: awayEdit.to,
      start_time: awayEdit.start || null,
      end_time: awayEdit.end || null,
      note: awayEdit.note.trim() || null,
    };
    const { error } = awayEdit.id
      ? await supabase.from("time_away").update(row).eq("id", awayEdit.id)
      : await supabase.from("time_away").insert(row);
    setAwayBusy(false);
    if (error) {
      setAwayError(
        (/time_away/.test(error.message) && /(relation|schema cache|does not exist)/i.test(error.message)) || /all_staff|time_away_kind_ck|time_away_who_ck|check constraint/i.test(error.message)
          ? "Time away needs one more setup step (migrations 0064 and 0067 in Supabase)."
          : error.message
      );
      return;
    }
    setAwayEdit(null);
    router.refresh();
  }

  async function deleteAway() {
    if (!awayEdit?.id) return;
    setAwayBusy(true);
    const { error } = await supabase.from("time_away").delete().eq("id", awayEdit.id);
    setAwayBusy(false);
    if (error) return setAwayError(error.message);
    setAwayEdit(null);
    router.refresh();
  }

  const weekStarts = Array.from({ length: weeksShown }, (_, i) => addDays(centerWeekStart, i * 7));
  const todayStr = toDateOnly(new Date());
  const thisWeekStartStr = toDateOnly(mondayOf(new Date()));
  const dayCount = showWeekends ? 7 : 5;

  function shiftWeeks(n: number) {
    setCenterWeekStart((prev) => addDays(prev, n * 7));
  }

  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen]);

  function goToday() {
    setCenterWeekStart(mondayOf(new Date()));
  }

  return (
    <div className={fullScreen ? "fixed inset-0 z-[45] overflow-auto bg-[var(--bg)] p-4" : ""}>
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
          {!installerNote && awayPeople.length > 0 && (
            <button
              onClick={() => openAway()}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:border-accent"
            >
              + Add time away
            </button>
          )}
          <button
            onClick={() => setShowWeekends((s) => !s)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-accent"
          >
            {showWeekends ? "Hide weekends" : "Show weekends"}
          </button>
          <select
            value={weeksShown}
            onChange={(e) => setWeeksShown(Number(e.target.value))}
            title="How many weeks to show"
            className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm hover:border-accent"
          >
            {[3, 4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n} weeks
              </option>
            ))}
          </select>
          <input
            type="date"
            title="Jump to the week of a date"
            aria-label="Jump to date"
            onChange={(e) => e.target.value && setCenterWeekStart(mondayOf(new Date(e.target.value + "T00:00:00")))}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
          />
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
          <button
            onClick={() => setFullScreen((f) => !f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              fullScreen ? "bg-[#201f1c] text-white" : "border border-[var(--border)] hover:border-accent"
            }`}
          >
            {fullScreen ? "Exit full screen (Esc)" : "⛶ Full screen"}
          </button>
          {!installerNote && (
            <Link href="/dashboard/calendar/day-sheet" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:border-accent">
              Print day sheet
            </Link>
          )}
        </div>
      </div>

      {installerNote ? (
        <div className="mt-3 rounded-lg border border-[#f3d48a] bg-[#fff8e6] px-3 py-2 text-sm text-[#7a5a0f]">{installerNote}</div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--muted)]">Show:</span>
          {(
            [
              ["wo", "Work orders", "bg-orange-500"],
              ["po", "PO deliveries", "bg-blue-500"],
              ["delivery", "Stock deliveries", "bg-red-500"],
              ...(invoiceDeliveries.length > 0 || hiddenKinds.includes("invdelivery") ? [["invdelivery", "Invoice deliveries", "bg-red-500"]] : []),
              ["visit", "Site visits", "bg-lime-400"],
              ["inspection", "Inspections", "bg-[#1e3a8a]"],
              ...(crmTasks.length > 0 || hiddenKinds.includes("crm") ? [["crm", "My CRM tasks", "bg-purple-500"]] : []),
            ] as string[][]
          ).map(([k, label, dot]) => {
            const off = hiddenKinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleKind(k)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium ${
                  off ? "border-[var(--border)] bg-transparent text-[var(--muted)] line-through" : "border-[#201f1c] bg-[var(--surface)] text-[#201f1c]"
                }`}
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${off ? "bg-[#d4d0c7]" : dot}`} />
                {label}
              </button>
            );
          })}
          <span className="text-[var(--muted)]">Inspections: drag to another day, or tap Move.</span>
        </div>
      )}
      {bookingErrors.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <strong>Couldn&apos;t book these inspections onto the calendar:</strong>
          <ul className="mt-1 list-disc pl-5">
            {bookingErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {bookingErrors.some((e) => /status_check|Scheduled/i.test(e)) && (
            <p className="mt-1">The database still needs the &ldquo;Scheduled&rdquo; update — run migration 0023 in Supabase.</p>
          )}
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
                  const events = (eventsByDate.get(dateStr) || []).filter((e) => !hiddenKinds.includes(e.kind));
                  const isToday = dateStr === todayStr;
                  return (
                    <div
                      key={dateStr}
                      className={`min-h-[110px] p-2 ${closedOn(dateStr) ? "bg-red-100/60" : isToday ? "bg-amber-50" : ""} ${
                        (dragId || woDrag) && dropDate === dateStr ? "bg-blue-50 ring-2 ring-inset ring-[#1e3a8a]" : ""
                      }`}
                      onDragOver={(e) => {
                        if (!dragId && !woDrag) return;
                        e.preventDefault();
                        if (dropDate !== dateStr) setDropDate(dateStr);
                      }}
                      onDragLeave={() => setDropDate((d) => (d === dateStr ? null : d))}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (woDrag) {
                          const w = woDrag;
                          const evs = (eventsByDate.get(w.from) || []).find((x) => x.kind === "wo" && x.workOrderId === w.woId) as WoEvent | undefined;
                          setWoDrag(null);
                          setDropDate(null);
                          moveWorkOrder(w.woId, w.label, w.from, dateStr, evs?.subIds ?? []);
                          return;
                        }
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
                      {!installerNote && awayOn(dateStr).length > 0 && (
                        <div className="mt-1 flex flex-col gap-1">
                          {awayOn(dateStr).map((a) => {
                            const who = awayNameByKey[awayKey(a)] || "Someone";
                            const times = a.start_time ? `${fmtTime(a.start_time)}${a.end_time ? "–" + fmtTime(a.end_time) : ""}` : "";
                            return (
                              <button
                                key={`away-${a.id}`}
                                type="button"
                                onClick={() => openAway(a)}
                                title={`${who} — ${a.kind}${times ? " " + times : ""}${a.note ? " — " + a.note : ""} (click to edit)`}
                                className={`block w-full rounded border px-1.5 py-1 text-left text-[11px] leading-tight ${AWAY_STYLE[a.kind] || AWAY_STYLE.Other}`}
                              >
                                <div className="truncate font-medium">
                                  {a.kind === "Closed" ? "CLOSED — nothing to be booked" : `${who.split(" ")[0]} · ${a.kind}`}
                                  {times ? ` · ${times}` : ""}
                                </div>
                                {a.note && <div className="truncate">{a.note}</div>}
                              </button>
                            );
                          })}
                        </div>
                      )}
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
                                title={`${ev.woNumber} — ${ev.builderName} (${ev.address}) — ${ev.tasks.join(", ")} (${ev.contractorNames})${installerNote ? "" : " — drag to another day to reschedule"}`}
                                draggable={!installerNote && !ev.complete}
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = "move";
                                  setWoDrag({ woId: ev.workOrderId, from: ev.date, label: ev.woNumber });
                                }}
                                onDragEnd={() => {
                                  setWoDrag(null);
                                  setDropDate(null);
                                }}
                                className={`block rounded px-1.5 py-1 text-[11px] leading-tight ${ev.complete ? "border border-green-400 bg-green-100 text-green-900 hover:bg-green-200" : "wo-chip bg-orange-200 text-orange-900 hover:bg-orange-300"} ${installerNote || ev.complete ? "" : "cursor-grab active:cursor-grabbing"}`}
                              >
                                <div className="truncate font-medium">
                                  {ev.complete ? "✓ " : ""}{ev.time ? `${fmtTime(ev.time)} · ` : ""}{ev.woNumber} · {ev.contractorNames}
                                </div>
                                <div className={`truncate ${ev.complete ? "text-green-800" : "text-orange-900"}`}>
                                  {ev.builderName} — {ev.address}
                                </div>
                                {ev.complete ? (
                                  <div className="font-bold uppercase text-green-800">Complete{ev.qty > 0 ? ` · ${ev.qty} m²` : ""}</div>
                                ) : (
                                  ev.qty > 0 && <div className="text-orange-900">{ev.qty} m² to install</div>
                                )}
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
                          if (ev.kind === "delivery") {
                            return (
                              <Link
                                key={`delivery-${ev.id}`}
                                href={`/dashboard/work-orders/${ev.workOrderId}/picking-slip`}
                                title={`Stock delivery — ${ev.woNumber} — ${ev.customerName} (${ev.address})${ev.suppliers ? ` — ${ev.suppliers}` : ""}`}
                                className="block rounded bg-red-600 px-1.5 py-1 text-[11px] leading-tight text-white hover:bg-red-700"
                              >
                                <div className="truncate font-bold">Stock delivery · {ev.woNumber}</div>
                                {ev.suppliers && <div className="truncate font-semibold">{ev.suppliers}</div>}
                                <div className="truncate text-red-100">
                                  {ev.customerName} — {ev.address}
                                </div>
                              </Link>
                            );
                          }
                          if (ev.kind === "invdelivery") {
                            return (
                              <Link
                                key={`invdelivery-${ev.id}`}
                                href={`/dashboard/invoices/${ev.invoiceId}`}
                                title={`${ev.pickup ? "Customer pick-up" : "Delivery"} — INV-${ev.invoiceNumber} — ${ev.customerName} (${ev.address})`}
                                className="block rounded bg-red-600 px-1.5 py-1 text-[11px] leading-tight text-white hover:bg-red-700"
                              >
                                <div className="truncate font-bold">
                                  {ev.pickup ? "Pick-up" : "Delivery"} · INV-{ev.invoiceNumber}
                                </div>
                                <div className="truncate text-red-100">
                                  {ev.customerName}
                                  {ev.pickup ? "" : ` — ${ev.address}`}
                                </div>
                              </Link>
                            );
                          }
                          if (ev.kind === "crm") {
                            return (
                              <Link
                                key={`crm-${ev.id}`}
                                href={ev.href}
                                title={`CRM follow-up — ${ev.title}${ev.who ? ` (${ev.who})` : ""}`}
                                className="block rounded bg-purple-100 px-1.5 py-1 text-[11px] leading-tight text-purple-900 hover:bg-purple-200"
                              >
                                <div className="truncate font-medium">
                                  {ev.taskKind} · {ev.title}
                                </div>
                                {ev.who && <div className="truncate text-purple-800">{ev.who}</div>}
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
                              className="block rounded bg-lime-300 px-1.5 py-1 text-[11px] leading-tight text-[#1a2e05] hover:bg-lime-400"
                            >
                              <div className="truncate font-medium">
                                {ev.time ? `${fmtTime(ev.time)} · ` : ""}
                                {ev.customerName}
                              </div>
                              <div className="truncate text-[#365314]">{ev.address}</div>
                              {ev.assignedToName && <div className="truncate text-[#365314]">{ev.assignedToName}</div>}
                              {(ev.status === "Visited" || ev.status === "Quoted") && (
                                <span
                                  className={`mt-0.5 inline-block rounded px-1 text-[10px] font-bold uppercase ${
                                    ev.status === "Quoted" ? "bg-[#1f6b35] text-white" : "bg-[#1e4fbf] text-white"
                                  }`}
                                >
                                  {ev.status}
                                </span>
                              )}
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

      {awayEdit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAwayEdit(null)}>
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 text-black shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{awayEdit.id ? "Edit time away" : "Add time away"}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <label className="col-span-2 flex flex-col gap-1">
                Who
                <select value={awayEdit.who} onChange={(e) => setAwayEdit({ ...awayEdit, who: e.target.value, kind: e.target.value === "all" ? "Closed" : awayEdit.kind === "Closed" ? "Holiday" : awayEdit.kind })} className="rounded-lg border border-gray-300 px-3 py-2">
                  {["Everyone", "Office", "Contractors"].map((g) => (
                    <optgroup key={g} label={g}>
                      {awayPeople.filter((p) => p.group === g).map((p) => (
                        <option key={p.key} value={p.key}>{p.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                Type
                <select value={awayEdit.kind} onChange={(e) => setAwayEdit({ ...awayEdit, kind: e.target.value, who: e.target.value === "Closed" ? "all" : awayEdit.who === "all" ? awayPeople.find((p) => p.key !== "all")?.key || "" : awayEdit.who })} className="rounded-lg border border-gray-300 px-3 py-2">
                  {AWAY_KINDS.map((k) => <option key={k}>{k}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                First day
                <input type="date" value={awayEdit.from} onChange={(e) => setAwayEdit({ ...awayEdit, from: e.target.value, to: awayEdit.to < e.target.value ? e.target.value : awayEdit.to })} className="rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1">
                Last day
                <input type="date" value={awayEdit.to} min={awayEdit.from} onChange={(e) => setAwayEdit({ ...awayEdit, to: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1">
                Start time (optional)
                <input type="time" value={awayEdit.start} onChange={(e) => setAwayEdit({ ...awayEdit, start: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1">
                End time (optional)
                <input type="time" value={awayEdit.end} onChange={(e) => setAwayEdit({ ...awayEdit, end: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                Note (optional)
                <input value={awayEdit.note} onChange={(e) => setAwayEdit({ ...awayEdit, note: e.target.value })} placeholder="e.g. Dentist, Fiji trip" className="rounded-lg border border-gray-300 px-3 py-2" />
              </label>
            </div>
            {awayError && <p className="mt-3 text-sm text-red-600">{awayError}</p>}
            <div className="mt-4 flex items-center gap-2">
              <button onClick={saveAway} disabled={awayBusy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {awayBusy ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setAwayEdit(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              {awayEdit.id && (
                <button onClick={deleteAway} disabled={awayBusy} className="ml-auto text-sm text-red-600 hover:underline">Delete</button>
              )}
            </div>
          </div>
        </div>
      )}
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
  const done = ev.status === "Completed" || ev.result === "PASS" || ev.result === "FAIL";
  const label = ev.result === "PASS" || ev.result === "FAIL" ? ev.result : ev.status === "Scheduled" ? "Booked" : "In progress";

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
          : "cursor-grab border-2 border-[#1e3a8a] bg-[#dbe4f7] font-bold text-[#1e3a8a] active:cursor-grabbing"
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
            className="mt-1 w-full rounded border border-[#1e3a8a] bg-white px-1 py-0.5 text-[12px] font-normal text-[#201f1c]"
            aria-label="Move inspection to"
          />
        ) : (
          <button
            type="button"
            onClick={() => setMoving(true)}
            className="mt-1 rounded border border-[#1e3a8a] bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#1e3a8a]"
          >
            Move
          </button>
        ))}
    </div>
  );
}
