"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TASK_KINDS,
  dueLabel,
  staffName,
  todayISO,
  type Lead,
  type Staff,
  type Task,
} from "@/lib/crm";

type Visit = {
  id: string;
  visit_number: number;
  visit_date: string;
  visit_time: string | null;
  status: string;
  customer_name: string | null;
  address: string | null;
  suburb: string | null;
  assigned_to: string | null;
};

const KIND_STYLE: Record<string, string> = {
  Call: "bg-[#e8f0fe] text-[#1e4fbf]",
  Email: "bg-[#f1e8fb] text-[#5b2a8a]",
  Visit: "bg-[#fff4d6] text-[#7a5a0f]",
  Other: "bg-[#f1f0ed] text-[#6b6862]",
};
const VISIT_STYLE = "bg-[#e6f4ea] text-[#1f6b35]";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base sm:text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function CrmCalendar({
  tasks,
  setTasks,
  leads,
  staff,
  userId,
  supabase,
  setError,
}: {
  tasks: Task[];
  setTasks: (t: Task[]) => void;
  leads: Lead[];
  staff: Staff[];
  userId: string;
  supabase: any;
  setError: (e: string | null) => void;
}) {
  const today = todayISO();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [who, setWho] = useState<string>(userId); // user id, or "all"
  const [showTasks, setShowTasks] = useState(true);
  const [showVisits, setShowVisits] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selected, setSelected] = useState<string>(today);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("Call");
  const [assignee, setAssignee] = useState(userId);

  // Grid starts on the Monday on/before the 1st and runs 6 weeks.
  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(ym.y, ym.m, 1 - offset + i);
      return { date: iso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === ym.m };
    });
  }, [ym]);

  const from = cells[0].date;
  const to = cells[41].date;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("site_visits")
        .select("id, visit_number, visit_date, visit_time, status, customer_name, address, suburb, assigned_to")
        .eq("archived", false)
        .gte("visit_date", from)
        .lte("visit_date", to)
        .order("visit_time");
      if (!cancelled) setVisits((data ?? []) as Visit[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, from, to]);

  const visibleTasks = tasks.filter(
    (t) => showTasks && (who === "all" || t.assigned_to === who) && (showDone || !t.done) && t.due_date >= from && t.due_date <= to
  );
  const visibleVisits = visits.filter((v) => showVisits && (who === "all" || v.assigned_to === who || !v.assigned_to));

  const byDay = (date: string) => ({
    t: visibleTasks.filter((t) => t.due_date === date),
    v: visibleVisits.filter((v) => v.visit_date === date),
  });

  async function toggle(t: Task) {
    const done = !t.done;
    const { error } = await supabase
      .from("crm_tasks")
      .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? userId : null })
      .eq("id", t.id);
    if (error) return setError(error.message);
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, done } : x)));
  }

  async function add() {
    if (!title.trim()) return;
    const { data, error } = await supabase
      .from("crm_tasks")
      .insert({ title: title.trim(), kind, due_date: selected, assigned_to: assignee, created_by: userId })
      .select("*, leads:crm_leads(name), customers(name)")
      .single();
    if (error) return setError(error.message);
    setTasks([...tasks, data as Task]);
    setTitle("");
  }

  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  function step(n: number) {
    const d = new Date(ym.y, ym.m + n, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  }
  const sel = byDay(selected);
  const leadName = (id: string | null) => leads.find((l) => l.id === id)?.name;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">&larr;</button>
          <div className="min-w-[10rem] text-center text-lg font-bold">{monthLabel}</div>
          <button onClick={() => step(1)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">&rarr;</button>
        </div>
        <button
          onClick={() => {
            setYm({ y: now.getFullYear(), m: now.getMonth() });
            setSelected(today);
          }}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          Today
        </button>
        <select className={`${inputCls} !w-auto`} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value={userId}>My calendar</option>
          <option value="all">Everyone</option>
          {staff
            .filter((s) => s.id !== userId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || "Unnamed user"}
              </option>
            ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} /> Follow-ups</label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showVisits} onChange={(e) => setShowVisits(e.target.checked)} /> Site visits</label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Completed</label>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-xl border border-[var(--border)]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="border-b border-[var(--border)] bg-[#f6f5f2] px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {d}
            </div>
          ))}
          {cells.map((c) => {
            const { t, v } = byDay(c.date);
            const items = [
              ...v.map((x) => ({ key: "v" + x.id, label: `${x.visit_time ? x.visit_time.slice(0, 5) + " " : ""}SV${x.visit_number} ${x.customer_name || x.address || ""}`, cls: VISIT_STYLE, done: false, overdue: false })),
              ...t.map((x) => ({ key: "t" + x.id, label: x.title, cls: KIND_STYLE[x.kind] || KIND_STYLE.Other, done: x.done, overdue: !x.done && x.due_date < today })),
            ];
            const isSel = c.date === selected;
            return (
              <button
                key={c.date}
                onClick={() => setSelected(c.date)}
                className={`flex min-h-[96px] flex-col items-stretch gap-1 border-b border-r border-[var(--border)] p-1.5 text-left ${
                  c.inMonth ? "bg-[var(--surface)]" : "bg-[#faf9f7] opacity-60"
                } ${isSel ? "outline outline-2 -outline-offset-2 outline-[var(--brand-gold-dark)]" : ""}`}
              >
                <span className={`self-end text-xs tabular-nums ${c.date === today ? "rounded-full bg-[#201f1c] px-1.5 font-bold text-white" : "text-[var(--muted)]"}`}>
                  {c.day}
                </span>
                {items.slice(0, 3).map((it) => (
                  <span
                    key={it.key}
                    className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${it.cls} ${it.done ? "line-through opacity-60" : ""} ${it.overdue ? "ring-1 ring-red-400" : ""}`}
                  >
                    {it.label}
                  </span>
                ))}
                {items.length > 3 && <span className="text-[11px] text-[var(--muted)]">+{items.length - 3} more</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] p-4 text-sm">
        <h3 className="font-semibold">
          {new Date(selected + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
        </h3>
        <div className="mt-2 flex flex-col divide-y divide-[var(--border)]">
          {sel.v.length === 0 && sel.t.length === 0 && <div className="py-2 text-[var(--muted)]">Nothing scheduled.</div>}
          {sel.v.map((x) => (
            <Link key={x.id} href={`/dashboard/site-visits/${x.id}`} className="flex items-center gap-3 py-2 hover:bg-[#f6f5f2]">
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${VISIT_STYLE}`}>Site visit</span>
              <span className="flex-1">
                SV{x.visit_number} · {x.customer_name || "—"}
                <span className="text-[var(--muted)]"> · {[x.address, x.suburb].filter(Boolean).join(", ")}</span>
              </span>
              <span className="text-[var(--muted)]">
                {x.visit_time ? x.visit_time.slice(0, 5) + " · " : ""}
                {staffName(staff, x.assigned_to)} · {x.status}
              </span>
            </Link>
          ))}
          {sel.t.map((t) => (
            <label key={t.id} className="flex items-center gap-3 py-2">
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="h-4 w-4" />
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${KIND_STYLE[t.kind] || KIND_STYLE.Other}`}>{t.kind}</span>
              <span className={`flex-1 ${t.done ? "text-[var(--muted)] line-through" : ""}`}>
                {t.lead_id || t.customer_id ? (
                  <Link
                    href={t.lead_id ? `/dashboard/crm/leads/${t.lead_id}` : `/dashboard/crm/accounts/${t.customer_id}`}
                    className="text-accent hover:underline"
                    title="Open the CRM file"
                  >
                    {t.title}
                  </Link>
                ) : (
                  t.title
                )}
                {(t.customers?.name || leadName(t.lead_id)) && (
                  <span className="text-[var(--muted)]"> · {t.customers?.name || leadName(t.lead_id)}</span>
                )}
              </span>
              <span className={!t.done && dueLabel(t.due_date, today).overdue ? "font-semibold text-red-700" : "text-[var(--muted)]"}>
                {staffName(staff, t.assigned_to)}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-12">
          <input className={`${inputCls} col-span-2 sm:col-span-6`} placeholder="Add a follow-up on this day" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <select className={`${inputCls} sm:col-span-2`} value={kind} onChange={(e) => setKind(e.target.value)}>
            {TASK_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <select className={`${inputCls} sm:col-span-3`} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === userId ? "Me" : s.full_name || "Unnamed user"}
              </option>
            ))}
          </select>
          <button onClick={add} className="col-span-2 rounded-lg bg-[var(--brand-gold)] px-3 py-2 font-semibold text-[#201f1c] sm:col-span-1">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
