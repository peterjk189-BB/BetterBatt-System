"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVITY_KINDS,
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
  type Task,
} from "@/lib/crm";
import { ensureLead, logActivity } from "@/lib/crmActions";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base sm:text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

export type CrmSeed = {
  siteVisitId?: string | null;
  projectId?: string | null;
  customerId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  suburb?: string | null;
  from?: string;
};

/**
 * The CRM tab shown on a site visit, a quote and a customer. It finds the CRM
 * file(s) linked to the record, shows their follow-ups and history, and lets
 * office staff log a note or add a follow-up without leaving the page.
 */
export default function CrmPanel({ seed, mode }: { seed: CrmSeed; mode: "record" | "customer" }) {
  const supabase = useMemo(() => createClient(), []);
  const today = todayISO();
  const [userId, setUserId] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("Call");
  const [note, setNote] = useState("");
  const [tTitle, setTTitle] = useState("");
  const [tKind, setTKind] = useState<string>("Call");
  const [tDue, setTDue] = useState(today);
  const [tWho, setTWho] = useState("");

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id || "";
    setUserId(uid);
    setTWho((w) => w || uid);

    const conds: string[] = [];
    if (mode === "customer") {
      if (seed.customerId) conds.push(`customer_id.eq.${seed.customerId}`);
    } else {
      if (seed.projectId) conds.push(`project_id.eq.${seed.projectId}`);
      if (seed.siteVisitId) conds.push(`site_visit_id.eq.${seed.siteVisitId}`);
    }
    const [{ data: st }, leadRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("role", ["admin", "office"]).order("full_name"),
      conds.length
        ? supabase
            .from("crm_leads")
            .select("*, projects(quote_number, outcome), site_visits(visit_number, status)")
            .or(conds.join(","))
            .eq("archived", false)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);
    setStaff((st ?? []) as Staff[]);
    const ls = ((leadRes as any).data ?? []) as Lead[];
    setLeads(ls);

    const ids = ls.map((l) => l.id);
    const tc: string[] = [];
    const ac: string[] = [];
    if (ids.length) {
      tc.push(`lead_id.in.(${ids.join(",")})`);
      ac.push(`lead_id.in.(${ids.join(",")})`);
    }
    if (mode === "customer" && seed.customerId) {
      tc.push(`customer_id.eq.${seed.customerId}`);
      ac.push(`customer_id.eq.${seed.customerId}`);
    }
    if (tc.length) {
      const [{ data: t }, { data: a }] = await Promise.all([
        supabase.from("crm_tasks").select("*").or(tc.join(",")).order("due_date"),
        supabase.from("crm_activity").select("*").or(ac.join(",")).order("created_at", { ascending: false }),
      ]);
      setTasks((t ?? []) as Task[]);
      setActivity((a ?? []) as Activity[]);
    } else {
      setTasks([]);
      setActivity([]);
    }
    setLoading(false);
  }, [supabase, seed.customerId, seed.projectId, seed.siteVisitId, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const lead = leads[0] || null;

  async function createFile() {
    setError(null);
    const id = await ensureLead(
      supabase,
      {
        siteVisitId: seed.siteVisitId,
        projectId: seed.projectId,
        customerId: seed.customerId,
        name: seed.name,
        phone: seed.phone,
        email: seed.email,
        address: seed.address,
        suburb: seed.suburb,
        from: seed.from || "this record",
      },
      userId
    );
    if (!id) return setError("Couldn't create the CRM file.");
    await load();
  }

  async function addNote() {
    if (!note.trim()) return;
    const e = await logActivity(
      supabase,
      { kind, note: note.trim(), lead_id: lead?.id ?? null, customer_id: lead?.customer_id || seed.customerId || null },
      userId
    );
    if (e) return setError(e);
    setNote("");
    load();
  }

  async function addTask() {
    if (!tTitle.trim() || !tWho) return;
    if (!lead && !seed.customerId) return setError("Create the CRM file first.");
    const { error: err } = await supabase.from("crm_tasks").insert({
      title: tTitle.trim(),
      kind: tKind,
      due_date: tDue,
      assigned_to: tWho,
      lead_id: lead?.id ?? null,
      customer_id: lead?.customer_id || seed.customerId || null,
      created_by: userId,
    });
    if (err) return setError(err.message);
    setTTitle("");
    load();
  }

  async function toggle(t: Task) {
    const done = !t.done;
    const { error: err } = await supabase
      .from("crm_tasks")
      .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? userId : null })
      .eq("id", t.id);
    if (err) return setError(err.message);
    load();
  }

  if (loading) return <div className="mt-6 text-sm text-[var(--muted)]">Loading CRM…</div>;

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="mt-5 flex flex-col gap-5 text-sm">
      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-red-900">{error}</div>}

      {leads.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] p-5">
          <div className="font-semibold">No CRM file yet</div>
          <p className="mt-1 text-[var(--muted)]">
            {mode === "customer"
              ? "This customer has no enquiries on file. You can still log calls and add follow-ups below."
              : "New records get a CRM file automatically. This one pre-dates that, so create it now to track follow-ups."}
          </p>
          {mode === "record" && (
            <button onClick={createFile} className="mt-3 rounded-lg bg-accent px-4 py-2 font-medium text-white">
              Create CRM file
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {leads.map((l) => {
            const stage = effectiveStage(l);
            return (
              <Link
                key={l.id}
                href={`/dashboard/crm/leads/${l.id}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] p-4 hover:border-[var(--brand-gold-dark)]"
              >
                <span className="font-mono text-xs text-[var(--muted)]">E{l.lead_number}</span>
                <span className="font-semibold">{l.name}</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}>{stage}</span>
                <span className="text-[var(--muted)]">Owner: {staffName(staff, l.owner_id)}</span>
                <span className="ml-auto text-accent">Open CRM file &rarr;</span>
              </Link>
            );
          })}
        </div>
      )}

      {(leads.length > 0 || (mode === "customer" && seed.customerId)) && (
        <>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <h3 className="font-semibold">Follow-ups</h3>
            <div className="mt-2 flex flex-col divide-y divide-[var(--border)]">
              {open.length === 0 && <div className="py-2 text-[var(--muted)]">Nothing due.</div>}
              {open.map((t) => {
                const d = dueLabel(t.due_date, today);
                return (
                  <label key={t.id} className="flex items-center gap-3 py-2">
                    <input type="checkbox" checked={false} onChange={() => toggle(t)} className="h-4 w-4" />
                    <span className="flex-1">
                      {t.title} <span className="text-[var(--muted)]">· {t.kind} · {staffName(staff, t.assigned_to)}</span>
                    </span>
                    <span className={d.overdue ? "font-semibold text-red-700" : "text-[var(--muted)]"}>{d.text}</span>
                  </label>
                );
              })}
              {done.slice(0, 3).map((t) => (
                <label key={t.id} className="flex items-center gap-3 py-2 text-[var(--muted)]">
                  <input type="checkbox" checked onChange={() => toggle(t)} className="h-4 w-4" />
                  <span className="flex-1 line-through">{t.title}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-12">
              <input className={`${inputCls} col-span-2 sm:col-span-5`} placeholder="New follow-up, e.g. Ring about quote" value={tTitle} onChange={(e) => setTTitle(e.target.value)} />
              <select className={`${inputCls} sm:col-span-2`} value={tKind} onChange={(e) => setTKind(e.target.value)}>
                {TASK_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <input type="date" className={`${inputCls} sm:col-span-2`} value={tDue} onChange={(e) => setTDue(e.target.value)} />
              <select className={`${inputCls} col-span-2 sm:col-span-2`} value={tWho} onChange={(e) => setTWho(e.target.value)}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id === userId ? "Me" : s.full_name || "Unnamed user"}
                  </option>
                ))}
              </select>
              <button onClick={addTask} className="col-span-2 rounded-lg bg-[var(--brand-gold)] px-3 py-2 font-semibold text-[#201f1c] sm:col-span-1">
                Add
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4">
            <h3 className="font-semibold">Log a call, email or note</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-12">
              <select className={`${inputCls} sm:col-span-2`} value={kind} onChange={(e) => setKind(e.target.value)}>
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <input className={`${inputCls} col-span-2 sm:col-span-8`} placeholder="What was said or agreed?" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
              <button onClick={addNote} className="col-span-2 rounded-lg bg-accent px-3 py-2 font-medium text-white sm:col-span-2">
                Log
              </button>
            </div>
            <div className="mt-3 flex flex-col divide-y divide-[var(--border)]">
              {activity.length === 0 && <div className="py-2 text-[var(--muted)]">No history yet.</div>}
              {activity.map((a) => (
                <div key={a.id} className="py-2">
                  <span className="font-medium">{a.kind}</span> <span className="text-[var(--muted)]">· {fmtDay(a.created_at)} · {staffName(staff, a.created_by)}</span>
                  <div className="whitespace-pre-wrap">{a.note}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {mode === "customer" && seed.customerId && (
        <Link href={`/dashboard/crm/accounts/${seed.customerId}`} className="text-accent hover:underline">
          Open the full account page (check-in schedule, quotes, site visits) &rarr;
        </Link>
      )}
    </div>
  );
}
