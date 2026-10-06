"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVITY_KINDS,
  TASK_KINDS,
  STAGE_STYLES,
  dueLabel,
  fmtDay,
  nextCheckin,
  staffName,
  todayISO,
  type Activity,
  type Staff,
  type Stage,
  type Task,
} from "@/lib/crm";
import { logActivity } from "@/lib/crmActions";

type Customer = {
  id: string;
  name: string;
  category: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  checkin_every_days: number | null;
  last_contact_at: string | null;
  crm_owner_id: string | null;
};

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base sm:text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

const CHECKIN_PRESETS: { label: string; days: number | null }[] = [
  { label: "No regular check-in", days: null },
  { label: "Every 2 weeks", days: 14 },
  { label: "Every 4 weeks", days: 28 },
  { label: "Every 6 weeks", days: 42 },
  { label: "Every 3 months", days: 90 },
  { label: "Every 6 months", days: 180 },
  { label: "Every 12 months", days: 365 },
];

export default function AccountView({
  userId,
  initialCustomer,
  quotes,
  visits,
  leads,
  initialTasks,
  initialActivity,
  staff,
}: {
  userId: string;
  initialCustomer: Customer;
  quotes: { id: string; quote_number: number; address: string | null; suburb: string | null; outcome: string; entry_date: string }[];
  visits: { id: string; visit_number: number; visit_date: string; status: string; address: string | null; suburb: string | null }[];
  leads: { id: string; lead_number: number; name: string; stage: Stage; created_at: string }[];
  initialTasks: Task[];
  initialActivity: Activity[];
  staff: Staff[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const [c, setC] = useState<Customer>(initialCustomer);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activity, setActivity] = useState<Activity[]>(initialActivity);
  const [error, setError] = useState<string | null>(null);
  const [actKind, setActKind] = useState<string>("Call");
  const [actNote, setActNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskKind, setTaskKind] = useState<string>("Call");
  const [taskDue, setTaskDue] = useState(today);
  const [taskWho, setTaskWho] = useState(initialCustomer.crm_owner_id || userId);

  const next = nextCheckin(c.checkin_every_days, c.last_contact_at, today);
  const accepted = quotes.filter((q) => q.outcome === "Accepted").length;

  async function saveCheckin(days: number | null, owner: string | null) {
    setError(null);
    const { error: err } = await supabase.from("customers").update({ checkin_every_days: days, crm_owner_id: owner }).eq("id", c.id);
    if (err) return setError(err.message);
    setC((x) => ({ ...x, checkin_every_days: days, crm_owner_id: owner }));
  }

  async function addActivity() {
    if (!actNote.trim()) return;
    const err = await logActivity(supabase, { kind: actKind, note: actNote.trim(), customer_id: c.id }, userId);
    if (err) return setError(err);
    setActivity((a) => [{ id: crypto.randomUUID(), kind: actKind, note: actNote.trim(), created_by: userId, created_at: new Date().toISOString() }, ...a]);
    if (actKind !== "Note") setC((x) => ({ ...x, last_contact_at: new Date().toISOString() }));
    setActNote("");
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    const { data, error: err } = await supabase
      .from("crm_tasks")
      .insert({ title: taskTitle.trim(), kind: taskKind, due_date: taskDue, assigned_to: taskWho, customer_id: c.id, created_by: userId })
      .select("*")
      .single();
    if (err) return setError(err.message);
    setTasks((t) => [...t, data as Task]);
    setTaskTitle("");
  }

  async function completeTask(t: Task) {
    const { error: err } = await supabase
      .from("crm_tasks")
      .update({ done: true, done_at: new Date().toISOString(), done_by: userId })
      .eq("id", t.id);
    if (err) return setError(err.message);
    setTasks((all) => all.map((x) => (x.id === t.id ? { ...x, done: true } : x)));
  }

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <Link href="/dashboard/crm?tab=accounts" className="text-sm text-[var(--muted)] hover:underline">
        &larr; Repeat work
      </Link>
      <h1 className="mt-1 text-2xl font-bold">
        {c.name} <span className="text-base font-normal text-[var(--muted)]">{c.category}</span>
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {[c.contact_name, c.contact_phone, c.contact_email].filter(Boolean).join(" · ") || "No contact details on file"}
      </p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {quotes.length} quote{quotes.length === 1 ? "" : "s"} ({accepted} accepted) · {visits.length} site visit{visits.length === 1 ? "" : "s"} · last contact{" "}
        {c.last_contact_at ? fmtDay(c.last_contact_at) : "never"}
      </p>

      {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      <Card title="Check-in">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">How often should we touch base?</span>
            <select
              className={inputCls}
              value={c.checkin_every_days ?? ""}
              onChange={(e) => saveCheckin(e.target.value ? Number(e.target.value) : null, c.crm_owner_id)}
            >
              {CHECKIN_PRESETS.map((p) => (
                <option key={p.label} value={p.days ?? ""}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Who looks after this account?</span>
            <select className={inputCls} value={c.crm_owner_id || ""} onChange={(e) => saveCheckin(c.checkin_every_days, e.target.value || null)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || "Unnamed user"}
                </option>
              ))}
            </select>
          </label>
        </div>
        {next && (
          <p className={`mt-3 text-sm font-medium ${next <= today ? "text-[#b91c1c]" : "text-[var(--muted)]"}`}>
            {next <= today ? "Time to check in — log a call or email below to reset the clock." : `Next check-in ${fmtDay(next)}.`}
          </p>
        )}
      </Card>

      <Card title="Log contact">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_auto]">
          <select className={inputCls} value={actKind} onChange={(e) => setActKind(e.target.value)}>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={inputCls} placeholder="What was said or agreed?" value={actNote} onChange={(e) => setActNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addActivity()} />
          <button onClick={addActivity} className="rounded-lg bg-[#201f1c] px-4 py-2 text-sm font-semibold text-white">
            Log
          </button>
        </div>
        <div className="mt-3 divide-y divide-[var(--border)]">
          {activity.length === 0 && <p className="py-2 text-sm text-[var(--muted)]">Nothing logged yet.</p>}
          {activity.map((a) => (
            <div key={a.id} className="py-2 text-sm">
              <div className="text-xs text-[var(--muted)]">
                {a.kind} · {staffName(staff, a.created_by)} · {fmtDay(a.created_at)}
              </div>
              <div className="whitespace-pre-wrap">{a.note}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Tasks">
        <div className="divide-y divide-[var(--border)]">
          {tasks.length === 0 && <p className="py-2 text-sm text-[var(--muted)]">No tasks yet.</p>}
          {tasks.map((t) => {
            const d = dueLabel(t.due_date, today);
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[#b1841f]" checked={t.done} disabled={t.done} onChange={() => completeTask(t)} aria-label={`Mark done: ${t.title}`} />
                <span className={`min-w-0 flex-1 ${t.done ? "text-[var(--muted)] line-through" : "font-medium"}`}>{t.title}</span>
                <span className="text-xs text-[var(--muted)]">{staffName(staff, t.assigned_to)}</span>
                <span className={`text-xs font-medium ${d.overdue && !t.done ? "text-[#b91c1c]" : "text-[var(--muted)]"}`}>{t.done ? "Done" : d.text}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-12">
          <input className={`${inputCls} col-span-2 md:col-span-5`} placeholder="New task, e.g. Ring about new builds" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
          <select className={`${inputCls} md:col-span-2`} value={taskKind} onChange={(e) => setTaskKind(e.target.value)}>
            {TASK_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input type="date" className={`${inputCls} md:col-span-2`} value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
          <select className={`${inputCls} md:col-span-2`} value={taskWho} onChange={(e) => setTaskWho(e.target.value)}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === userId ? "Me" : s.full_name || "Unnamed user"}
              </option>
            ))}
          </select>
          <button onClick={addTask} className="rounded-lg bg-[var(--brand-gold)] px-3 py-2 text-sm font-semibold text-[#201f1c] md:col-span-1">
            Add
          </button>
        </div>
      </Card>

      <Card title="History">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <List title="Enquiries" empty="None">
            {leads.map((l) => (
              <Link key={l.id} href={`/dashboard/crm/leads/${l.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:underline">
                <span>EN{l.lead_number} · {fmtDay(l.created_at)}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STAGE_STYLES[l.stage]}`}>{l.stage}</span>
              </Link>
            ))}
          </List>
          <List title="Quotes" empty="None">
            {quotes.map((q) => (
              <Link key={q.id} href={`/dashboard/quotes/${q.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:underline">
                <span className="min-w-0 truncate">Q{q.quote_number}{q.suburb ? ` · ${q.suburb}` : ""}</span>
                <span className="shrink-0 text-xs text-[var(--muted)]">{q.outcome}</span>
              </Link>
            ))}
          </List>
          <List title="Site visits" empty="None">
            {visits.map((v) => (
              <Link key={v.id} href={`/dashboard/site-visits/${v.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:underline">
                <span className="min-w-0 truncate">SV{v.visit_number}{v.suburb ? ` · ${v.suburb}` : ""}</span>
                <span className="shrink-0 text-xs text-[var(--muted)]">{fmtDay(v.visit_date)}</span>
              </Link>
            ))}
          </List>
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--brand-grey)]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function List({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 divide-y divide-[var(--border)]">{items.length === 0 ? <p className="py-1.5 text-sm text-[var(--muted)]">{empty}</p> : children}</div>
    </div>
  );
}
