"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVITY_KINDS,
  LOST_REASONS,
  SOURCES,
  STAGES,
  STAGE_STYLES,
  TASK_KINDS,
  dueLabel,
  effectiveStage,
  fmtDay,
  staffName,
  todayISO,
  type Activity,
  type Lead,
  type Staff,
  type Stage,
  type Task,
} from "@/lib/crm";
import { logActivity, moveStage } from "@/lib/crmActions";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base sm:text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

type Quote = { id: string; quote_number: number; address: string | null; suburb: string | null; outcome: string; customers: { name: string } | null };
type Visit = { id: string; visit_number: number; visit_date: string; customer_name: string | null; suburb: string | null };

export default function LeadEditor({
  userId,
  initialLead,
  initialTasks,
  initialActivity,
  staff,
  customers,
  quotes,
  visits,
}: {
  userId: string;
  initialLead: Lead;
  initialTasks: Task[];
  initialActivity: Activity[];
  staff: Staff[];
  customers: { id: string; name: string }[];
  quotes: Quote[];
  visits: Visit[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const today = todayISO();

  const [lead, setLead] = useState<Lead>(initialLead);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activity, setActivity] = useState<Activity[]>(initialActivity);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [lostPick, setLostPick] = useState<string>(LOST_REASONS[0]);
  const [askLost, setAskLost] = useState(false);

  const [actKind, setActKind] = useState<string>("Call");
  const [actNote, setActNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskKind, setTaskKind] = useState<string>("Call");
  const [taskDue, setTaskDue] = useState(today);
  const [taskWho, setTaskWho] = useState(initialLead.owner_id || userId);

  const stage = effectiveStage(lead);
  const set = <K extends keyof Lead>(k: K, v: Lead[K]) => setLead((l) => ({ ...l, [k]: v }));

  async function save() {
    setError(null);
    const { error: err } = await supabase
      .from("crm_leads")
      .update({
        name: lead.name.trim() || "Unnamed",
        phone: lead.phone?.trim() || null,
        email: lead.email?.trim() || null,
        address: lead.address?.trim() || null,
        suburb: lead.suburb?.trim() || null,
        source: lead.source,
        enquiry_note: lead.enquiry_note?.trim() || null,
        est_value: lead.est_value === null || (lead.est_value as unknown) === "" ? null : Number(lead.est_value),
        owner_id: lead.owner_id,
        customer_id: lead.customer_id,
        project_id: lead.project_id,
        site_visit_id: lead.site_visit_id,
      })
      .eq("id", lead.id);
    if (err) return setError(err.message);
    setSaved(new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }));
    router.refresh();
  }

  async function changeStage(to: Stage, reason?: string) {
    if (to === stage) return;
    if (to === "Lost" && reason === undefined) {
      setAskLost(true);
      return;
    }
    setError(null);
    const err = await moveStage(supabase, lead, stage, to, userId, reason);
    if (err) return setError(err);
    set("stage", to);
    set("lost_reason", to === "Lost" ? reason || null : null);
    const { data } = await supabase.from("crm_tasks").select("*").eq("lead_id", lead.id).order("due_date");
    if (data) setTasks(data as Task[]);
  }

  async function linkQuote(id: string) {
    const q = quotes.find((x) => x.id === id);
    set("project_id", id || null);
    set("projects", q ? { quote_number: q.quote_number, outcome: q.outcome } : null);
    await supabase.from("crm_leads").update({ project_id: id || null }).eq("id", lead.id);
    // A quote now exists, so the lead is at least "Quote sent" — which also sets the 3 / 7 day follow-ups.
    if (q && ["New enquiry", "Site visit booked"].includes(lead.stage)) {
      await changeStage("Quote sent");
    }
  }

  async function linkVisit(id: string) {
    const v = visits.find((x) => x.id === id);
    set("site_visit_id", id || null);
    set("site_visits", v ? { visit_number: v.visit_number, status: "Booked" } : null);
    await supabase.from("crm_leads").update({ site_visit_id: id || null }).eq("id", lead.id);
  }

  async function createCustomer() {
    setError(null);
    const { data, error: err } = await supabase
      .from("customers")
      .insert({ name: lead.name.trim(), contact_name: lead.name.trim(), contact_phone: lead.phone, contact_email: lead.email })
      .select("id, name")
      .single();
    if (err || !data) return setError(err?.message || "Could not create the customer.");
    set("customer_id", data.id);
    set("customers", { name: data.name });
    await supabase.from("crm_leads").update({ customer_id: data.id }).eq("id", lead.id);
    router.refresh();
  }

  async function addActivity() {
    if (!actNote.trim()) return;
    const err = await logActivity(supabase, { kind: actKind, note: actNote.trim(), lead_id: lead.id, customer_id: lead.customer_id }, userId);
    if (err) return setError(err);
    setActivity((a) => [{ id: crypto.randomUUID(), kind: actKind, note: actNote.trim(), created_by: userId, created_at: new Date().toISOString() }, ...a]);
    setActNote("");
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    const { data, error: err } = await supabase
      .from("crm_tasks")
      .insert({
        title: taskTitle.trim(),
        kind: taskKind,
        due_date: taskDue,
        assigned_to: taskWho,
        lead_id: lead.id,
        customer_id: lead.customer_id,
        created_by: userId,
      })
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

  async function archive() {
    if (!confirm(`Remove ${lead.name} from the pipeline?`)) return;
    const { error: err } = await supabase.from("crm_leads").update({ archived: true }).eq("id", lead.id);
    if (err) return setError(err.message);
    router.push("/dashboard/crm");
  }

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <Link href="/dashboard/crm" className="text-sm text-[var(--muted)] hover:underline">
        &larr; CRM
      </Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {lead.name} <span className="font-mono text-base font-normal text-[var(--muted)]">EN{lead.lead_number}</span>
        </h1>
        <button onClick={archive} className="text-sm text-[var(--muted)] hover:underline">
          Remove from pipeline
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => changeStage(s)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
              stage === s ? STAGE_STYLES[s] + " ring-2 ring-offset-1 ring-[#201f1c]/20" : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {stage === "Lost" && lead.lost_reason && <p className="mt-2 text-sm text-[var(--muted)]">Lost reason: {lead.lost_reason}</p>}

      <Card title="Enquiry">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Name" className="col-span-2">
            <input className={inputCls} value={lead.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Source" className="col-span-2">
            <select className={inputCls} value={lead.source} onChange={(e) => set("source", e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Phone" className="col-span-2">
            <input className={inputCls} inputMode="tel" value={lead.phone || ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email" className="col-span-2">
            <input className={inputCls} inputMode="email" value={lead.email || ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Address" className="col-span-2">
            <input className={inputCls} value={lead.address || ""} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Suburb">
            <input className={inputCls} value={lead.suburb || ""} onChange={(e) => set("suburb", e.target.value)} />
          </Field>
          <Field label="Estimated value ($)">
            <input
              className={inputCls}
              inputMode="decimal"
              value={lead.est_value ?? ""}
              onChange={(e) => set("est_value", (e.target.value === "" ? null : e.target.value) as unknown as number | null)}
            />
          </Field>
          <Field label="Owner" className="col-span-2">
            <select className={inputCls} value={lead.owner_id || ""} onChange={(e) => set("owner_id", e.target.value || null)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || "Unnamed user"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What they need" className="col-span-2 sm:col-span-4">
            <textarea className={inputCls} rows={3} value={lead.enquiry_note || ""} onChange={(e) => set("enquiry_note", e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} className="rounded-lg bg-[var(--brand-gold)] px-5 py-2 text-sm font-semibold text-[#201f1c]">
            Save
          </button>
          {saved && <span className="text-sm text-[var(--muted)]">Saved {saved}</span>}
        </div>
      </Card>

      <Card title="Linked records" hint="Link the customer, site visit and quote so the pipeline moves forward on its own.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Customer">
            <select
              className={inputCls}
              value={lead.customer_id || ""}
              onChange={async (e) => {
                const id = e.target.value || null;
                set("customer_id", id);
                set("customers", id ? { name: customers.find((c) => c.id === id)?.name || "" } : null);
                await supabase.from("crm_leads").update({ customer_id: id }).eq("id", lead.id);
              }}
            >
              <option value="">Not linked</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {lead.customer_id ? (
              <Link href={`/dashboard/crm/accounts/${lead.customer_id}`} className="text-sm text-accent hover:underline">
                Open account
              </Link>
            ) : (
              <button onClick={createCustomer} className="text-left text-sm text-accent hover:underline">
                Create customer from this enquiry
              </button>
            )}
          </Field>
          <Field label="Site visit">
            <select className={inputCls} value={lead.site_visit_id || ""} onChange={(e) => linkVisit(e.target.value)}>
              <option value="">Not linked</option>
              {visits.map((v) => (
                <option key={v.id} value={v.id}>
                  SV{v.visit_number} — {v.customer_name || "?"}
                  {v.suburb ? `, ${v.suburb}` : ""} ({fmtDay(v.visit_date)})
                </option>
              ))}
            </select>
            {lead.site_visit_id ? (
              <Link href={`/dashboard/site-visits/${lead.site_visit_id}`} className="text-sm text-accent hover:underline">
                Open site visit
              </Link>
            ) : (
              <Link href="/dashboard/site-visits/new" className="text-sm text-accent hover:underline">
                Book a new site visit
              </Link>
            )}
          </Field>
          <Field label="Quote">
            <select className={inputCls} value={lead.project_id || ""} onChange={(e) => linkQuote(e.target.value)}>
              <option value="">Not linked</option>
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  Q{q.quote_number} — {q.customers?.name || "?"}
                  {q.suburb ? `, ${q.suburb}` : ""} ({q.outcome})
                </option>
              ))}
            </select>
            {lead.project_id ? (
              <Link href={`/dashboard/quotes/${lead.project_id}`} className="text-sm text-accent hover:underline">
                Open quote
              </Link>
            ) : (
              <Link href="/dashboard/quotes" className="text-sm text-accent hover:underline">
                Go to quotes
              </Link>
            )}
          </Field>
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
          <input className={`${inputCls} col-span-2 md:col-span-5`} placeholder="New task" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
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

      <Card title="Activity">
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

      {askLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="font-semibold">Why was {lead.name} lost?</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {LOST_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setLostPick(r)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${lostPick === r ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[var(--border)]"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAskLost(false)} className="px-3 py-2 text-sm text-[var(--muted)]">
                Cancel
              </button>
              <button
                onClick={() => {
                  setAskLost(false);
                  changeStage("Lost", lostPick);
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

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--brand-grey)]">{title}</h2>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-sm ${className}`}>
      <span className="text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}
