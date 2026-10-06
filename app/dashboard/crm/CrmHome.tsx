"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LOST_REASONS,
  STAGES,
  STAGE_STYLES,
  TASK_KINDS,
  addDaysISO,
  daysBetween,
  dueLabel,
  effectiveStage,
  fmtDay,
  nextCheckin,
  staffName,
  todayISO,
  type Lead,
  type Staff,
  type Stage,
  type Task,
} from "@/lib/crm";
import { moveStage } from "@/lib/crmActions";
import CrmCalendar from "./CrmCalendar";

type Customer = {
  id: string;
  name: string;
  category: string;
  contact_phone: string | null;
  checkin_every_days: number | null;
  last_contact_at: string | null;
  crm_owner_id: string | null;
};

type Tab = "pipeline" | "tasks" | "calendar" | "accounts";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

export default function CrmHome({
  userId,
  initialTab,
  initialLeads,
  initialTasks,
  staff,
  customers,
}: {
  userId: string;
  initialTab: Tab;
  initialLeads: Lead[];
  initialTasks: Task[];
  staff: Staff[];
  customers: Customer[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const today = todayISO();

  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [error, setError] = useState<string | null>(null);

  async function refetchTasks() {
    const { data } = await supabase
      .from("crm_tasks")
      .select("*, leads:crm_leads(name), customers(name)")
      .order("due_date", { ascending: true });
    if (data) setTasks(data as Task[]);
  }

  const myOpenDue = tasks.filter((t) => !t.done && t.assigned_to === userId && t.due_date <= today).length;
  const accountsDue = customers.filter((c) => {
    const n = nextCheckin(c.checkin_every_days, c.last_contact_at, today);
    return n !== null && n <= today;
  }).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Enquiries, follow-ups and repeat work. Use “+ Enquiry” (bottom right) to log a call or email.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["pipeline", "Pipeline", leads.filter((l) => !["Won", "Lost"].includes(effectiveStage(l))).length],
            ["tasks", "Tasks", myOpenDue],
            ["calendar", "Calendar", 0],
            ["accounts", "Repeat work", accountsDue],
          ] as [Tab, string, number][]
        ).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              router.replace(`/dashboard/crm${k === "pipeline" ? "" : `?tab=${k}`}`, { scroll: false });
            }}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === k ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {label}
            {n > 0 && (
              <span className={`ml-2 rounded-full px-1.5 text-xs tabular-nums ${k !== "pipeline" ? "bg-[#b91c1c] text-white" : "bg-black/10"}`}>
                {n}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      {tab === "pipeline" && (
        <Pipeline
          leads={leads}
          setLeads={setLeads}
          staff={staff}
          userId={userId}
          supabase={supabase}
          setError={setError}
          reload={refetchTasks}
        />
      )}
      {tab === "tasks" && (
        <Tasks tasks={tasks} setTasks={setTasks} staff={staff} userId={userId} supabase={supabase} setError={setError} leads={leads} customers={customers} />
      )}
      {tab === "calendar" && (
        <CrmCalendar tasks={tasks} setTasks={setTasks} leads={leads} staff={staff} userId={userId} supabase={supabase} setError={setError} />
      )}
      {tab === "accounts" && <Accounts customers={customers} staff={staff} today={today} />}
    </div>
  );
}

// ---------------------------------------------------------------- Pipeline

function Pipeline({
  leads,
  setLeads,
  staff,
  userId,
  supabase,
  setError,
  reload,
}: {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  staff: Staff[];
  userId: string;
  supabase: ReturnType<typeof createClient>;
  setError: (e: string | null) => void;
  reload: () => void | Promise<void>;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<Lead | null>(null);
  const [lostReason, setLostReason] = useState<string>(LOST_REASONS[0]);
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const today = todayISO();

  const q = search.trim().toLowerCase();
  const visible = leads.filter(
    (l) => !q || [l.name, l.suburb, l.phone, l.address].some((v) => (v || "").toLowerCase().includes(q))
  );

  async function change(lead: Lead, to: Stage, reason?: string) {
    const from = effectiveStage(lead);
    if (from === to) return;
    if (to === "Lost" && reason === undefined) {
      setLostFor(lead);
      return;
    }
    setError(null);
    const err = await moveStage(supabase, lead, from, to, userId, reason);
    if (err) {
      setError(err);
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: to, lost_reason: to === "Lost" ? reason || null : null } : l)));
    if (to === "Quote sent" || to === "Won" || to === "Lost") reload(); // follow-up tasks changed
  }

  const columns = STAGES.filter((s) => showClosed || (s !== "Won" && s !== "Lost"));

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <input
          className="w-full max-w-sm rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          placeholder="Search name, suburb or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => setShowClosed((v) => !v)} className="text-sm text-[var(--muted)] underline">
          {showClosed ? "Hide Won / Lost" : "Show Won / Lost"}
        </button>
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-3">
        {columns.map((stage) => {
          const col = visible.filter((l) => effectiveStage(l) === stage);
          const total = col.reduce((s, l) => s + (Number(l.est_value) || 0), 0);
          return (
            <div
              key={stage}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-[var(--border)] bg-[#f6f5f2]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const l = leads.find((x) => x.id === dragId);
                setDragId(null);
                if (l) change(l, stage);
              }}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STAGE_STYLES[stage]}`}>{stage}</span>
                <span className="text-xs tabular-nums text-[var(--muted)]">
                  {col.length}
                  {total > 0 ? ` · ${total.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 })}` : ""}
                </span>
              </div>
              <div className="flex min-h-[80px] flex-col gap-2 px-2 pb-2">
                {col.map((l) => {
                  const age = daysBetween(l.created_at.slice(0, 10), today);
                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      className="cursor-grab rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm shadow-sm active:cursor-grabbing"
                    >
                      <Link href={`/dashboard/crm/leads/${l.id}`} className="font-semibold hover:underline">
                        {l.name}
                      </Link>
                      <div className="mt-0.5 text-xs text-[var(--muted)]">
                        {[l.suburb, l.source].filter(Boolean).join(" · ")}
                        {l.projects ? ` · Q${l.projects.quote_number}` : ""}
                      </div>
                      {l.enquiry_note && <div className="mt-1 line-clamp-2 text-xs">{l.enquiry_note}</div>}
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                        <span>
                          {age === 0 ? "Today" : `${age}d`} · {staffName(staff, l.owner_id).split(" ")[0]}
                        </span>
                        <select
                          aria-label="Move to stage"
                          value={effectiveStage(l)}
                          onChange={(e) => change(l, e.target.value as Stage)}
                          className="rounded border border-[var(--border)] bg-white px-1 py-0.5 text-xs"
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
                {col.length === 0 && <div className="px-2 py-4 text-center text-xs text-[var(--muted)]">Nothing here</div>}
              </div>
            </div>
          );
        })}
      </div>

      {lostFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="font-semibold">Why was {lostFor.name} lost?</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {LOST_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setLostReason(r)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    lostReason === r ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[var(--border)]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setLostFor(null)} className="px-3 py-2 text-sm text-[var(--muted)]">
                Cancel
              </button>
              <button
                onClick={() => {
                  const l = lostFor;
                  setLostFor(null);
                  change(l, "Lost", lostReason);
                }}
                className="rounded-lg bg-[#201f1c] px-4 py-2 text-sm font-semibold text-white"
              >
                Mark as lost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Tasks

function Tasks({
  tasks,
  setTasks,
  staff,
  userId,
  supabase,
  setError,
  leads,
  customers,
}: {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  staff: Staff[];
  userId: string;
  supabase: ReturnType<typeof createClient>;
  setError: (e: string | null) => void;
  leads: Lead[];
  customers: Customer[];
}) {
  const today = todayISO();
  const [customerText, setCustomerText] = useState("");
  const [who, setWho] = useState<string>(userId); // a user id, or "all"
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("Call");
  const [due, setDue] = useState(today);
  const [assignee, setAssignee] = useState(userId);
  const [leadId, setLeadId] = useState("");

  const mine = tasks.filter((t) => (who === "all" || t.assigned_to === who) && (showDone ? t.done : !t.done));
  const overdue = mine.filter((t) => !t.done && t.due_date < today);
  const dueToday = mine.filter((t) => !t.done && t.due_date === today);
  const upcoming = mine.filter((t) => !t.done && t.due_date > today);

  async function complete(t: Task, againInDays?: number) {
    setError(null);
    const { error } = await supabase
      .from("crm_tasks")
      .update({ done: true, done_at: new Date().toISOString(), done_by: userId })
      .eq("id", t.id);
    if (error) return setError(error.message);
    let next: Task | null = null;
    if (againInDays) {
      const { data, error: e2 } = await supabase
        .from("crm_tasks")
        .insert({
          title: t.title,
          kind: t.kind,
          due_date: addDaysISO(today, againInDays),
          assigned_to: t.assigned_to,
          lead_id: t.lead_id,
          customer_id: t.customer_id,
          created_by: userId,
        })
        .select("*, leads:crm_leads(name), customers(name)")
        .single();
      if (e2) return setError(e2.message);
      next = data as Task;
    }
    setTasks((prev) => [...prev.map((x) => (x.id === t.id ? { ...x, done: true } : x)), ...(next ? [next] : [])]);
  }

  async function add() {
    if (!title.trim()) return;
    setError(null);
    const lead = leads.find((l) => l.id === leadId);
    const typed = customerText.trim().toLowerCase();
    const picked = typed ? customers.find((c) => c.name.toLowerCase() === typed) : undefined;
    if (typed && !picked) return setError("Pick a customer or builder from the list, or clear that box.");
    const { data, error } = await supabase
      .from("crm_tasks")
      .insert({
        title: title.trim(),
        kind,
        due_date: due,
        assigned_to: assignee,
        lead_id: leadId || null,
        customer_id: picked?.id || lead?.customer_id || null,
        created_by: userId,
      })
      .select("*, leads:crm_leads(name), customers(name)")
      .single();
    if (error) return setError(error.message);
    setTasks((prev) => [...prev, data as Task]);
    setTitle("");
    setLeadId("");
    setCustomerText("");
  }

  const Row = ({ t }: { t: Task }) => {
    const d = dueLabel(t.due_date, today);
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-4 py-2.5 text-sm first:border-t-0">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[#b1841f]"
          checked={t.done}
          disabled={t.done}
          onChange={() => complete(t)}
          aria-label={`Mark done: ${t.title}`}
        />
        <div className="min-w-0 flex-1">
          <div className={t.done ? "text-[var(--muted)] line-through" : "font-medium"}>{t.title}</div>
          <div className="text-xs text-[var(--muted)]">
            {t.kind}
            {t.customer_id && t.customers?.name ? (
              <>
                {" · "}
                <Link href={`/dashboard/crm/accounts/${t.customer_id}`} className="font-medium text-accent hover:underline">
                  {t.customers.name}
                </Link>
              </>
            ) : null}
            {t.lead_id && t.leads?.name ? (
              <>
                {" · Enquiry: "}
                <Link href={`/dashboard/crm/leads/${t.lead_id}`} className="text-accent hover:underline">
                  {t.leads.name}
                </Link>
              </>
            ) : null}
            {" · "}
            {staffName(staff, t.assigned_to)}
          </div>
        </div>
        <span className={`text-xs font-medium ${d.overdue && !t.done ? "text-[#b91c1c]" : "text-[var(--muted)]"}`}>{t.done ? "Done" : d.text}</span>
        {!t.done && (
          <div className="flex gap-1.5">
            <button onClick={() => complete(t, 3)} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--brand-gold-dark)]">
              Done, again in 3d
            </button>
            <button onClick={() => complete(t, 7)} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--brand-gold-dark)]">
              7d
            </button>
          </div>
        )}
      </div>
    );
  };

  const Group = ({ title: gt, list, tone }: { title: string; list: Task[]; tone?: string }) =>
    list.length === 0 ? null : (
      <div className="mt-4">
        <h2 className={`text-xs font-bold uppercase tracking-wider ${tone || "text-[var(--brand-grey)]"}`}>
          {gt} <span className="tabular-nums">({list.length})</span>
        </h2>
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {list.map((t) => (
            <Row key={t.id} t={t} />
          ))}
        </div>
      </div>
    );

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Showing tasks for
          <select className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value={userId}>Me</option>
            {staff
              .filter((s) => s.id !== userId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || "Unnamed user"}
                </option>
              ))}
            <option value="all">Everyone</option>
          </select>
        </label>
        <button onClick={() => setShowDone((v) => !v)} className="text-sm text-[var(--muted)] underline">
          {showDone ? "Show open tasks" : "Show completed"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] bg-[#f6f5f2] p-3 md:grid-cols-12">
        <input className={`${inputCls} md:col-span-6`} placeholder="New task, e.g. Ring about new builds" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input
          className={`${inputCls} md:col-span-4`}
          placeholder="Customer / builder (start typing)"
          list="crm-task-customers"
          value={customerText}
          onChange={(e) => setCustomerText(e.target.value)}
        />
        <datalist id="crm-task-customers">
          {customers.map((c) => (
            <option key={c.id} value={c.name}>
              {c.category}
            </option>
          ))}
        </datalist>
        <select className={`${inputCls} md:col-span-2`} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
          <option value="">No enquiry</option>
          {leads
            .filter((l) => !["Won", "Lost"].includes(effectiveStage(l)))
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
        <select className={`${inputCls} md:col-span-2`} value={kind} onChange={(e) => setKind(e.target.value)}>
          {TASK_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <input type="date" className={`${inputCls} md:col-span-3`} value={due} onChange={(e) => setDue(e.target.value)} />
        <select className={`${inputCls} md:col-span-5`} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id === userId ? "Assign to: Me" : `Assign to: ${s.full_name || "Unnamed user"}`}
            </option>
          ))}
        </select>
        <button onClick={add} className="rounded-lg bg-[var(--brand-gold)] px-3 py-2 text-sm font-semibold text-[#201f1c] md:col-span-2">
          Add task
        </button>
      </div>

      {showDone ? (
        <Group title="Completed" list={mine} />
      ) : (
        <>
          <Group title="Overdue" list={overdue} tone="text-[#b91c1c]" />
          <Group title="Today" list={dueToday} />
          <Group title="Upcoming" list={upcoming} />
          {mine.length === 0 && (
            <p className="mt-6 rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              No open tasks{who === userId ? " for you" : ""}. Tasks are created automatically 3 and 7 days after a quote is sent.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Accounts

function Accounts({ customers, staff, today }: { customers: Customer[]; staff: Staff[]; today: string }) {
  const [search, setSearch] = useState("");
  const [onlyBuilders, setOnlyBuilders] = useState(false);

  const withCheckin = customers
    .map((c) => ({ c, next: nextCheckin(c.checkin_every_days, c.last_contact_at, today) }))
    .filter((x) => x.next !== null)
    .sort((a, b) => (a.next as string).localeCompare(b.next as string));
  const quiet = withCheckin.filter((x) => (x.next as string) <= today);
  const upcoming = withCheckin.filter((x) => (x.next as string) > today);

  const q = search.trim().toLowerCase();
  const matches = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) && (!onlyBuilders || c.category === "Builder")).slice(0, 20)
    : [];

  const Line = ({ c, next }: { c: Customer; next: string }) => {
    const d = dueLabel(next, today);
    return (
      <Link
        href={`/dashboard/crm/accounts/${c.id}`}
        className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2.5 text-sm first:border-t-0 hover:bg-[#faf9f6]"
      >
        <div>
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-[var(--muted)]">
            {c.category} · every {c.checkin_every_days} days · last contact {c.last_contact_at ? fmtDay(c.last_contact_at) : "never"}
            {c.crm_owner_id ? ` · ${staffName(staff, c.crm_owner_id)}` : ""}
          </div>
        </div>
        <span className={`text-xs font-semibold ${d.overdue ? "text-[#b91c1c]" : "text-[var(--muted)]"}`}>
          {d.overdue ? `Gone quiet — ${d.text}` : `Next: ${d.text}`}
        </span>
      </Link>
    );
  };

  return (
    <div>
      <div className="mt-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[#b91c1c]">
          Time to check in <span className="tabular-nums">({quiet.length})</span>
        </h2>
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {quiet.map(({ c, next }) => (
            <Line key={c.id} c={c} next={next as string} />
          ))}
          {quiet.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Nobody due. Set a check-in on a customer or builder below to start tracking them.</p>}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--brand-grey)]">
            Coming up <span className="tabular-nums">({upcoming.length})</span>
          </h2>
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {upcoming.map(({ c, next }) => (
              <Line key={c.id} c={c} next={next as string} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--brand-grey)]">Find a customer or builder</h2>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <input className="w-full max-w-sm rounded-lg border border-[var(--border)] px-3 py-2 text-sm" placeholder="Start typing a name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyBuilders} onChange={(e) => setOnlyBuilders(e.target.checked)} /> Builders only
          </label>
        </div>
        {matches.length > 0 && (
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {matches.map((c) => (
              <Link key={c.id} href={`/dashboard/crm/accounts/${c.id}`} className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-sm first:border-t-0 hover:bg-[#faf9f6]">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-[var(--muted)]">{c.category}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
