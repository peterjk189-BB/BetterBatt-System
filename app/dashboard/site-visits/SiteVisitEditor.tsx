"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import CrmPanel from "@/app/dashboard/crm/CrmPanel";
import { ensureLead } from "@/lib/crmActions";
import {
  BATTEN_OPTIONS,
  BUILD_STAGES,
  SCAFFOLD_OPTIONS,
  SKYLIGHT_STATUS,
  VOID_OPTIONS,
  isBuilderVisit,
  ACCESS_LEVELS,
  CEILING_EXISTING,
  CEILING_METHODS,
  WALL_BATT_SIZES,
  CEILING_SUITABILITY,
  EMPTY_CHECKLIST,
  ROOF_TYPES,
  STATUS_STYLES,
  STOREYS,
  TRUSS_SIZES,
  UNDERFLOOR_PRODUCTS,
  UNDERFLOOR_SUITABILITY,
  VISIT_STATUSES,
  VISIT_TYPES,
  normaliseChecklist,
  roomArea,
  staffLabel,
  visitLabel,
  type Checklist,
  type Room,
  type SiteVisit,
  type Staff,
  type VisitPhoto,
} from "@/lib/siteVisit";
import SiteVisitPhotos from "./SiteVisitPhotos";

type Customer = { id: string; name: string; contact_phone: string | null; contact_email: string | null };
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base sm:text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formFromRow(v: any) {
  return {
    visit_date: v.visit_date || todayLocal(),
    visit_time: v.visit_time?.slice(0, 5) || "",
    status: v.status || "Booked",
    visit_type: v.visit_type || "Retro fit",
    customer_id: v.customer_id || "",
    customer_name: v.customer_name || "",
    phone: v.phone || "",
    email: v.email || "",
    address: v.address || "",
    suburb: v.suburb || "",
    notes: v.notes || "",
    assigned_to: v.assigned_to || "",
  };
}

export default function SiteVisitEditor({
  visit,
  photos,
  customers,
  staff,
  isAdmin,
  crmEnabled = false,
}: {
  visit: (SiteVisit & { projects?: { quote_number: number } | null }) | null;
  photos: VisitPhoto[];
  customers: Customer[];
  staff: Staff[];
  isAdmin: boolean;
  crmEnabled?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [visitId, setVisitId] = useState<string | null>(visit?.id ?? null);
  const [visitNumber, setVisitNumber] = useState<number | null>(visit?.visit_number ?? null);
  const [form, setForm] = useState({
    visit_date: visit?.visit_date || todayLocal(),
    visit_time: visit?.visit_time?.slice(0, 5) || "",
    status: visit?.status || "Booked",
    visit_type: visit?.visit_type || "Retro fit",
    customer_id: visit?.customer_id || "",
    customer_name: visit?.customer_name || "",
    phone: visit?.phone || "",
    email: visit?.email || "",
    address: visit?.address || "",
    suburb: visit?.suburb || "",
    notes: visit?.notes || "",
    assigned_to: visit?.assigned_to || "",
  });
  const [checklist, setChecklist] = useState<Checklist>(visit ? normaliseChecklist(visit.checklist) : { ...EMPTY_CHECKLIST });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "crm">("details");

  const builder = isBuilderVisit(form.visit_type);
  const creating = useRef<Promise<string | null> | null>(null);
  // Who has already been emailed about this visit (so autosaves don't email them again).
  const notifiedTo = useRef<string>(visit?.assigned_to || "");
  // Set once the office team has been told this visit is done.
  const notifiedVisited = useRef<boolean>(visit?.status === "Visited");
  const notifyVisited = useCallback((id: string, status: string) => {
    if (status !== "Visited") {
      notifiedVisited.current = false; // moved back out of Visited: tell them again next time it's done
      return;
    }
    if (notifiedVisited.current) return;
    notifiedVisited.current = true;
    fetch("/api/site-visits/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visit_id: id, event: "visited" }),
    }).catch(() => {});
  }, []);
  const notifyAssignee = useCallback(
    (id: string, assignedTo: string) => {
      if (!assignedTo || assignedTo === notifiedTo.current) return;
      notifiedTo.current = assignedTo;
      fetch("/api/site-visits/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: id }),
      }).catch(() => {});
    },
    []
  );
  const firstRender = useRef(true);
  // What the server last held, so we can tell which fields this user has edited since.
  const baseline = useRef<{ form: ReturnType<typeof formFromRow>; checklist: Checklist } | null>(
    visit ? { form: formFromRow(visit), checklist: normaliseChecklist(visit.checklist) } : null
  );
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const formRef = useRef<typeof form | null>(null);
  const checklistRef = useRef<Checklist | null>(null);

  const payload = useCallback(
    () => ({
      visit_date: form.visit_date,
      visit_time: form.visit_time || null,
      status: form.status,
      visit_type: form.visit_type,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      suburb: form.suburb.trim() || null,
      notes: form.notes || null,
      assigned_to: form.assigned_to || null,
      checklist,
    }),
    [form, checklist]
  );

  /** Insert the row if this is a new visit. Shared by the Save button and the first photo upload. */
  const ensureVisitId = useCallback(async (): Promise<string | null> => {
    if (visitId) return visitId;
    if (creating.current) return creating.current;
    if (!form.customer_name.trim()) {
      setError(builder ? "Enter the builder / company name first." : "Enter the customer name first.");
      return null;
    }
    creating.current = (async () => {
      setSaveState("saving");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error: insErr } = await supabase
        .from("site_visits")
        .insert({ ...payload(), created_by: user?.id ?? null })
        .select("id, visit_number, customer_name")
        .single();
      if (insErr || !data) {
        setSaveState("error");
        setError(insErr?.message || "Couldn't create the site visit.");
        creating.current = null;
        return null;
      }
      baseline.current = { form, checklist };
      setVisitId(data.id);
      setVisitNumber(data.visit_number);
      setSaveState("saved");
      setSavedAt(new Date());
      setError(null);
      // Swap the URL to the saved record without remounting, so uploads in progress carry on.
      window.history.replaceState(null, "", `/dashboard/site-visits/${data.id}`);
      logAudit(supabase, { eventType: "create", entityType: "site visit", entityId: data.id, entityLabel: visitLabel(data) });
      notifyAssignee(data.id, form.assigned_to);
      notifyVisited(data.id, form.status);
      if (crmEnabled && user?.id) {
        // Every new site visit gets a CRM file so follow-ups aren't missed.
        ensureLead(
          supabase,
          {
            siteVisitId: data.id,
            customerId: form.customer_id || null,
            name: form.customer_name,
            phone: form.phone,
            email: form.email,
            address: form.address,
            suburb: form.suburb,
            from: `site visit SV${data.visit_number}`,
          },
          user.id
        );
      }
      return data.id as string;
    })();
    return creating.current;
  }, [visitId, form, checklist, payload, supabase, notifyAssignee, notifyVisited]);

  const saveNow = useCallback(
    async (opts?: { audit?: boolean }) => {
      if (!visitId) {
        await ensureVisitId();
        return;
      }
      setSaveState("saving");
      const { error: upErr } = await supabase.from("site_visits").update(payload()).eq("id", visitId);
      if (upErr) {
        setSaveState("error");
        setError(upErr.message);
        return;
      }
      baseline.current = { form, checklist };
      setSaveState("saved");
      setSavedAt(new Date());
      setError(null);
      notifyAssignee(visitId, form.assigned_to);
      notifyVisited(visitId, form.status);
      if (opts?.audit && visitNumber) {
        logAudit(supabase, {
          eventType: "update",
          entityType: "site visit",
          entityId: visitId,
          entityLabel: visitLabel({ visit_number: visitNumber, customer_name: form.customer_name }),
        });
      }
    },
    [visitId, ensureVisitId, payload, supabase, visitNumber, form, checklist, form.customer_name, form.assigned_to, form.status, notifyAssignee, notifyVisited]
  );

  formRef.current = form;
  checklistRef.current = checklist;

  // Live updates: when someone else changes this visit, pull their changes in without
  // overwriting anything this user is in the middle of editing (merged field by field).
  useEffect(() => {
    if (!visitId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let noteTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    async function pull() {
      const { data } = await supabase.from("site_visits").select("*").eq("id", visitId).single();
      if (!data || cancelled) return;
      const remoteForm = formFromRow(data);
      const remoteCl = normaliseChecklist((data as any).checklist);
      const base = baseline.current;
      const curForm = formRef.current!;
      const curCl = checklistRef.current!;
      if (!base) {
        baseline.current = { form: remoteForm, checklist: remoteCl };
        return;
      }
      const changedForm = (Object.keys(remoteForm) as (keyof typeof remoteForm)[]).filter((k) => remoteForm[k] !== base.form[k]);
      const changedCl = (Object.keys(remoteCl) as (keyof Checklist)[]).filter(
        (k) => JSON.stringify(remoteCl[k]) !== JSON.stringify(base.checklist[k])
      );
      baseline.current = { form: remoteForm, checklist: remoteCl };
      // Only take remote values for fields this user hasn't touched since the last sync.
      const takeForm = changedForm.filter((k) => curForm[k] === base.form[k] && curForm[k] !== remoteForm[k]);
      const takeCl = changedCl.filter(
        (k) => JSON.stringify(curCl[k]) === JSON.stringify(base.checklist[k]) && JSON.stringify(curCl[k]) !== JSON.stringify(remoteCl[k])
      );
      if (takeForm.length === 0 && takeCl.length === 0) return;
      if (takeForm.length) {
        setForm((f) => {
          const n = { ...f };
          for (const k of takeForm) (n as any)[k] = remoteForm[k];
          return n;
        });
      }
      if (takeCl.length) {
        setChecklist((c) => {
          const n = { ...c };
          for (const k of takeCl) (n as any)[k] = remoteCl[k];
          return n;
        });
      }
      // Keep "notify" bookkeeping in step so we don't re-alert on someone else's change.
      notifiedTo.current = remoteForm.assigned_to || notifiedTo.current;
      if (remoteForm.status === "Visited") notifiedVisited.current = true;
      setLiveNote("Updated just now with a change from a colleague");
      if (noteTimer) clearTimeout(noteTimer);
      noteTimer = setTimeout(() => setLiveNote(null), 6000);
    }
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(pull, 600);
    };
    const channel = supabase
      .channel(`sv-live-${visitId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "site_visits", filter: `id=eq.${visitId}` }, soon)
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const poll = setInterval(onVisible, 30000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (noteTimer) clearTimeout(noteTimer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(channel);
    };
  }, [visitId, supabase]);

  // Autosave saved visits ~1.2s after the last change, so nothing is lost if
  // the phone locks or loses signal under the house. New visits wait for the
  // first Save (or first photo) so half-typed records don't pile up.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("dirty");
    if (!visitId) return;
    const t = setTimeout(() => saveNow(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, checklist]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function setC<K extends keyof Checklist>(k: K, v: Checklist[K]) {
    setChecklist((c) => ({ ...c, [k]: v }));
  }
  /** Ceiling-only job: hide the wall and underfloor sections and stop quoting them. */
  function setCeilingOnly(on: boolean) {
    setChecklist((c) => (on ? { ...c, ceiling_only: true, quote_ceiling: true, quote_walls: false, quote_underfloor: false } : { ...c, ceiling_only: false }));
  }
  function toggleIn(k: keyof Checklist, option: string) {
    setChecklist((c) => {
      const arr = (c[k] as string[]) || [];
      return { ...c, [k]: arr.includes(option) ? arr.filter((x) => x !== option) : [...arr, option] };
    });
  }

  function pickCustomer(id: string) {
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      customer_id: id,
      customer_name: c ? c.name : f.customer_name,
      phone: f.phone || c?.contact_phone || "",
      email: f.email || c?.contact_email || "",
    }));
  }

  async function toggleArchive() {
    if (!visitId) return;
    const archiving = !visit?.archived;
    if (archiving && !confirm(`Archive site visit SV${visitNumber}?`)) return;
    await supabase.from("site_visits").update({ archived: archiving }).eq("id", visitId);
    logAudit(supabase, {
      eventType: archiving ? "delete" : "update",
      entityType: "site visit",
      entityId: visitId,
      entityLabel: `SV${visitNumber}`,
      details: archiving ? "Archived" : "Restored",
    });
    router.push("/dashboard/site-visits");
    router.refresh();
  }

  const quoteNumber = visit?.projects?.quote_number;
  const statusLine =
    saveState === "saving"
      ? "Saving…"
      : saveState === "error"
      ? "Not saved — check signal"
      : saveState === "dirty"
      ? visitId
        ? "Unsaved changes"
        : "Not saved yet"
      : savedAt
      ? `Saved ${savedAt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`
      : visitId
      ? "All changes saved"
      : "Not saved yet";

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/site-visits" className="text-sm text-[var(--muted)] hover:underline">
            &larr; Site visits
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {visitNumber ? `Site visit SV${visitNumber}` : "New site visit"}
          </h1>
        </div>
        {visitId && (
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button onClick={toggleArchive} className="px-2 text-sm text-[var(--muted)] hover:underline">
                {visit?.archived ? "Restore" : "Archive"}
              </button>
            )}
            <Link
              href={`/dashboard/site-visits/${visitId}/print`}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)]"
            >
              Print / PDF
            </Link>
            {visit?.project_id && quoteNumber ? (
              <Link
                href={`/dashboard/quotes/${visit.project_id}`}
                className="rounded-lg border border-[#b7dfc2] bg-[#e6f4ea] px-4 py-2 text-sm font-medium text-[#1f6b35]"
              >
                Open quote Q{quoteNumber}
              </Link>
            ) : (
              <button
                onClick={async () => {
                  await saveNow();
                  router.push(`/dashboard/quotes/new?site_visit_id=${visitId}`);
                }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
              >
                Create quote
              </button>
            )}
          </div>
        )}
      </div>

      {crmEnabled && visitId && (
        <div className="mt-5 flex gap-1 border-b border-[var(--border)]">
          {([["details", "Site visit"], ["crm", "CRM"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-[var(--brand-gold-dark)] text-[#201f1c]" : "border-transparent text-[var(--muted)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {crmEnabled && visitId && tab === "crm" && (
        <CrmPanel
          mode="record"
          seed={{
            siteVisitId: visitId,
            projectId: visit?.project_id ?? null,
            customerId: form.customer_id || null,
            name: form.customer_name,
            phone: form.phone,
            email: form.email,
            address: form.address,
            suburb: form.suburb,
            from: `site visit SV${visitNumber}`,
          }}
        />
      )}

      <div className={tab === "crm" ? "hidden" : ""}>
      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>
      )}

      {/* Status */}
      <div className="mt-5 flex flex-wrap gap-2">
        {VISIT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => set("status", s)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
              form.status === s ? STATUS_STYLES[s] + " ring-2 ring-offset-1 ring-[#201f1c]/20" : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Customer & booking */}
      <Section title={builder ? "Builder & booking" : "Customer & booking"}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Visit date">
            <input type="date" className={inputCls} value={form.visit_date} onChange={(e) => set("visit_date", e.target.value)} />
          </Field>
          <Field label="Time">
            <input type="time" className={inputCls} value={form.visit_time} onChange={(e) => set("visit_time", e.target.value)} />
          </Field>
          <Field label="Visit type" className="col-span-2">
            <Segmented options={[...VISIT_TYPES]} value={form.visit_type} onChange={(v) => set("visit_type", v)} />
          </Field>
          <Field label="Assigned to" className="col-span-2">
            <select className={inputCls} value={form.assigned_to} onChange={(e) => set("assigned_to", e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {staffLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={builder ? "Builder / company" : "Customer name"} className="col-span-2">
            <input className={inputCls} value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} autoComplete="off" />
            {!form.customer_name.trim() && (
              <p className="mt-1 text-xs font-medium text-amber-700">Add a name so the visit list and alerts show who this is.</p>
            )}
          </Field>
          <Field label="Existing customer (builders etc.)" className="col-span-2">
            <select className={inputCls} value={form.customer_id} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">Not linked</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Address" className="col-span-2">
            <input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" />
          </Field>
          <Field label="Suburb" className="col-span-2">
            <input className={inputCls} value={form.suburb} onChange={(e) => set("suburb", e.target.value)} />
          </Field>
          {builder && (
            <Field label="Main contact (office / estimator)" className="col-span-2">
              <input className={inputCls} value={checklist.main_contact} onChange={(e) => setC("main_contact", e.target.value)} autoComplete="off" />
            </Field>
          )}
          <Field label={builder ? "Main contact phone" : "Phone"} className="col-span-2">
            <div className="flex gap-2">
              <input type="tel" inputMode="tel" className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              {form.phone.trim() && (
                <a href={`tel:${form.phone.replace(/\s/g, "")}`} className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm font-medium">
                  Call
                </a>
              )}
            </div>
          </Field>
          <Field label={builder ? "Main contact email" : "Email"} className="col-span-2">
            <input type="email" inputMode="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>
        {(form.address || form.suburb) && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([form.address, form.suburb, "VIC"].filter(Boolean).join(", "))}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-accent hover:underline"
          >
            Open address in Maps
          </a>
        )}
      </Section>

      {builder ? (
        <>
          <Section title="Site details & people on site" hint="The supervisor on the day is often not the person who booked the visit, so they get their own contact.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Lot / job number" className="col-span-2 sm:col-span-1">
                <input className={inputCls} value={checklist.lot_number} onChange={(e) => setC("lot_number", e.target.value)} />
              </Field>
              <Field label="Site supervisor name" className="col-span-2 sm:col-span-2">
                <input className={inputCls} value={checklist.supervisor_name} onChange={(e) => setC("supervisor_name", e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Site supervisor phone" className="col-span-2 sm:col-span-1">
                <div className="flex gap-2">
                  <input type="tel" inputMode="tel" className={inputCls} value={checklist.supervisor_phone} onChange={(e) => setC("supervisor_phone", e.target.value)} />
                  {checklist.supervisor_phone.trim() && (
                    <a href={`tel:${checklist.supervisor_phone.replace(/\s/g, "")}`} className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm font-medium">
                      Call
                    </a>
                  )}
                </div>
              </Field>
              <Field label="Best time to reach on site" className="col-span-2">
                <input className={inputCls} value={checklist.supervisor_time} onChange={(e) => setC("supervisor_time", e.target.value)} placeholder="e.g. Before 7:30 am" />
              </Field>
              <Field label="Site access / notes (gate codes, parking)" className="col-span-2">
                <input className={inputCls} value={checklist.access_notes} onChange={(e) => setC("access_notes", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Job specifics · Building site">
            <div className="flex flex-col gap-4">
              <Group label="Quoting">
                <Toggle on={checklist.quote_ceiling} onClick={() => setC("quote_ceiling", !checklist.quote_ceiling)}>
                  Ceiling batts
                </Toggle>
                <Toggle on={checklist.quote_underfloor} onClick={() => setC("quote_underfloor", !checklist.quote_underfloor)}>
                  Underfloor batts
                </Toggle>
                <Toggle on={checklist.quote_walls} onClick={() => setC("quote_walls", !checklist.quote_walls)}>
                  Wall batts
                </Toggle>
                <Toggle on={checklist.ceiling_only} onClick={() => setCeilingOnly(!checklist.ceiling_only)}>
                  Ceiling only (hide walls &amp; underfloor)
                </Toggle>
              </Group>
              <Group label="Stage of build">
                {BUILD_STAGES.map((o) => (
                  <Toggle key={o} on={checklist.stage === o} onClick={() => setC("stage", checklist.stage === o ? "" : o)}>
                    {o}
                  </Toggle>
                ))}
              </Group>
              <Group label="Storeys">
                {STOREYS.map((o) => (
                  <Toggle key={o} on={checklist.storeys === o} onClick={() => setC("storeys", checklist.storeys === o ? "" : o)}>
                    {o}
                  </Toggle>
                ))}
              </Group>
              <Group label="Roof">
                {ROOF_TYPES.map((o) => (
                  <Toggle key={o} on={checklist.roof.includes(o)} onClick={() => toggleIn("roof", o)}>
                    {o}
                  </Toggle>
                ))}
              </Group>
              <Group label="Truss spacing">
                {TRUSS_SIZES.map((o) => (
                  <Toggle key={o} on={checklist.truss === o} onClick={() => setC("truss", checklist.truss === o ? "" : o)}>
                    {o === "Mixed" ? "Mixed" : `${o} mm`}
                  </Toggle>
                ))}
              </Group>
              <Group label="Ceiling battened?">
                {BATTEN_OPTIONS.map((o) => (
                  <Toggle key={o} on={checklist.batten === o} onClick={() => setC("batten", checklist.batten === o ? "" : o)}>
                    {o}
                  </Toggle>
                ))}
              </Group>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {checklist.batten === BATTEN_OPTIONS[0] && (
                  <>
                    <Field label="Batten spacing (mm)">
                      <input inputMode="numeric" className={inputCls} value={checklist.batten_spacing} onChange={(e) => setC("batten_spacing", e.target.value)} />
                    </Field>
                    <Field label="Batten depth (mm)">
                      <input inputMode="numeric" className={inputCls} value={checklist.batten_depth} onChange={(e) => setC("batten_depth", e.target.value)} />
                    </Field>
                  </>
                )}
                <Field label="Ceiling height (m)" className="col-span-2">
                  <input className={inputCls} value={checklist.ceiling_height} onChange={(e) => setC("ceiling_height", e.target.value)} placeholder="e.g. 2.7 / 3.0 living" />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Skylights & shaft liners">
            <div className="flex flex-col gap-4">
              <Group label="Skylights?">
                {["None", "Yes"].map((o) => (
                  <Toggle key={o} on={checklist.skylights === o} onClick={() => setC("skylights", checklist.skylights === o ? "" : o)}>
                    {o}
                  </Toggle>
                ))}
              </Group>
              {checklist.skylights === "Yes" && (
                <>
                  <Group label="Box-out status">
                    {SKYLIGHT_STATUS.map((o) => (
                      <Toggle
                        key={o}
                        on={checklist.skylight_status === o}
                        tone={o === "Boxed out" ? "good" : o === "Not boxed out" ? "bad" : o === "Part done" ? "warn" : undefined}
                        onClick={() => setC("skylight_status", checklist.skylight_status === o ? "" : o)}
                      >
                        {o}
                      </Toggle>
                    ))}
                  </Group>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="How many">
                      <input inputMode="numeric" className={inputCls} value={checklist.skylight_count} onChange={(e) => setC("skylight_count", e.target.value)} />
                    </Field>
                    <Field label="Boxed out by" className="col-span-2">
                      <input className={inputCls} value={checklist.skylight_boxed_by} onChange={(e) => setC("skylight_boxed_by", e.target.value)} placeholder="e.g. Builder / carpenter" />
                    </Field>
                  </div>
                  <p className="text-xs text-[var(--muted)]">Insulation must stop short of the shaft liner, so un-boxed shafts need fixing before we install.</p>
                </>
              )}
            </div>
          </Section>

          <Section title="High ceilings & access">
            <div className="flex flex-col gap-4">
              <Group label="Over 3.0 m?">
                {["No", "Yes"].map((o) => (
                  <Toggle key={o} on={checklist.high_ceilings === o} onClick={() => setC("high_ceilings", checklist.high_ceilings === o ? "" : o)}>
                    {o}
                  </Toggle>
                ))}
              </Group>
              {checklist.high_ceilings === "Yes" && (
                <>
                  <Group label="Access to install">
                    {SCAFFOLD_OPTIONS.map((o) => (
                      <Toggle key={o} on={checklist.high_access.includes(o)} onClick={() => toggleIn("high_access", o)}>
                        {o}
                      </Toggle>
                    ))}
                  </Group>
                  <Group label="Void protection">
                    {VOID_OPTIONS.map((o) => (
                      <Toggle key={o} on={checklist.high_void.includes(o)} onClick={() => toggleIn("high_void", o)}>
                        {o}
                      </Toggle>
                    ))}
                  </Group>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Highest ceiling (m)">
                      <input className={inputCls} value={checklist.highest_ceiling} onChange={(e) => setC("highest_ceiling", e.target.value)} />
                    </Field>
                    <Field label="Area over 3.0 m (m²)">
                      <input inputMode="numeric" className={inputCls} value={checklist.area_over_3m} onChange={(e) => setC("area_over_3m", e.target.value)} />
                    </Field>
                    <Field label="Who arranges scaffold / protection" className="col-span-2">
                      <input className={inputCls} value={checklist.access_arranged_by} onChange={(e) => setC("access_arranged_by", e.target.value)} />
                    </Field>
                  </div>
                  <p className="text-xs text-[var(--muted)]">Stairwells, double-height voids and open edges need protection before anyone works at height.</p>
                </>
              )}
            </div>
          </Section>
        </>
      ) : (
      <>
      {/* Job specifics */}
      <Section title="Job specifics">
        <div className="flex flex-col gap-4">
          <Group label="Quoting">
            <Toggle on={checklist.quote_ceiling} onClick={() => setC("quote_ceiling", !checklist.quote_ceiling)}>
              Ceiling batts
            </Toggle>
            <Toggle on={checklist.quote_underfloor} onClick={() => setC("quote_underfloor", !checklist.quote_underfloor)}>
              Underfloor batts
            </Toggle>
            <Toggle on={checklist.quote_walls} onClick={() => setC("quote_walls", !checklist.quote_walls)}>
              Wall batts
            </Toggle>
                <Toggle on={checklist.ceiling_only} onClick={() => setCeilingOnly(!checklist.ceiling_only)}>
                  Ceiling only (hide walls &amp; underfloor)
                </Toggle>
          </Group>
          <Group label="Roof">
            {ROOF_TYPES.map((o) => (
              <Toggle key={o} on={checklist.roof.includes(o)} onClick={() => toggleIn("roof", o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <Group label="Storeys">
            {STOREYS.map((o) => (
              <Toggle key={o} on={checklist.storeys === o} onClick={() => setC("storeys", checklist.storeys === o ? "" : o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <Group label="Truss size">
            {TRUSS_SIZES.map((o) => (
              <Toggle key={o} on={checklist.truss === o} onClick={() => setC("truss", checklist.truss === o ? "" : o)}>
                {o === "Mixed" ? "Mixed" : `${o} mm`}
              </Toggle>
            ))}
          </Group>
          <Group label="Ceiling now">
            {CEILING_EXISTING.map((o) => (
              <Toggle key={o} on={checklist.existing.includes(o)} onClick={() => toggleIn("existing", o)}>
                {o}
              </Toggle>
            ))}
            <Toggle on={checklist.remove_batts} onClick={() => setC("remove_batts", !checklist.remove_batts)}>
              Insulation removal
            </Toggle>
          </Group>
          <Group label="Tile lift">
            <Toggle on={checklist.tile_lift} onClick={() => setC("tile_lift", !checklist.tile_lift)}>
              Tile lift needed
            </Toggle>
            {checklist.tile_lift && (
              <label className="flex items-center gap-2 text-sm">
                How many
                <input
                  inputMode="numeric"
                  className="w-20 rounded-lg border border-[var(--border)] px-3 py-2 text-base sm:text-sm"
                  value={checklist.tile_lift_qty}
                  onChange={(e) => setC("tile_lift_qty", e.target.value)}
                />
              </label>
            )}
          </Group>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Notes</span>
            <textarea
              rows={3}
              className={inputCls}
              placeholder="Anything else about the job specifics..."
              value={checklist.job_notes}
              onChange={(e) => setC("job_notes", e.target.value)}
            />
          </label>
        </div>
      </Section>
      </>
      )}

      {/* Ceiling */}
      <Section title="Ceiling batts" muted={!checklist.quote_ceiling} hint={!checklist.quote_ceiling ? "Tick Ceiling batts above if you're quoting the ceiling." : undefined}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="430 m²">
            <M2Input value={checklist.ceiling_430_m2} onChange={(v) => setC("ceiling_430_m2", v)} />
          </Field>
          <Field label="580 m²">
            <M2Input value={checklist.ceiling_580_m2} onChange={(v) => setC("ceiling_580_m2", v)} />
          </Field>
          <Field label="R rating">
            <input className={inputCls} placeholder="e.g. R6.0" value={checklist.ceiling_r_rating} onChange={(e) => setC("ceiling_r_rating", e.target.value)} />
          </Field>
          <Field label="Method">
            <select className={inputCls} value={checklist.ceiling_method} onChange={(e) => setC("ceiling_method", e.target.value)}>
              <option value="">Select...</option>
              {CEILING_METHODS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              {checklist.ceiling_method && !CEILING_METHODS.includes(checklist.ceiling_method) && (
                <option value={checklist.ceiling_method}>{checklist.ceiling_method}</option>
              )}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <Group label="Suitability">
            {CEILING_SUITABILITY.map((o) => (
              <Toggle key={o} on={checklist.ceiling_suitability.includes(o)} onClick={() => toggleIn("ceiling_suitability", o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <Group label="Ceiling access">
            {ACCESS_LEVELS.map((o) => (
              <Toggle key={o} tone={accessTone(o)} on={checklist.ceiling_access.includes(o)} onClick={() => toggleIn("ceiling_access", o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <RoomCalc
            area="Ceiling"
            rooms={checklist.rooms}
            onRooms={(r) => setC("rooms", r)}
            targets={[
              { label: "430", apply: (t) => setC("ceiling_430_m2", String(t)) },
              { label: "580", apply: (t) => setC("ceiling_580_m2", String(t)) },
            ]}
          />
        </div>
        <label className="mt-4 flex items-start gap-3 rounded-lg bg-[#fff8e6] px-3 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#b1841f]"
            checked={checklist.power_isolation_explained}
            onChange={(e) => setC("power_isolation_explained", e.target.checked)}
          />
          <span>
            <strong>Explained to the customer</strong> that the power is isolated while we install in the ceiling space.
          </span>
        </label>
      </Section>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <Toggle on={checklist.ceiling_only} onClick={() => setCeilingOnly(!checklist.ceiling_only)}>
          Ceiling only
        </Toggle>
        <span className="text-sm text-[var(--muted)]">
          {checklist.ceiling_only ? "Wall batts and Underfloor batts are hidden for this visit. Untick to bring them back." : "Tick to hide the Wall batts and Underfloor batts sections below."}
        </span>
      </div>

      {!checklist.ceiling_only && (
        <>
      {/* Walls */}
      <Section title="Wall batts" muted={!checklist.quote_walls} hint={!checklist.quote_walls ? "Tick Wall batts above if you're quoting walls." : undefined}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="External walls GF m²">
            <M2Input value={checklist.wall_ext_gf_m2} onChange={(v) => setC("wall_ext_gf_m2", v)} />
          </Field>
          <Field label="GF batt size">
            <select className={inputCls} value={checklist.wall_ext_gf_size} onChange={(e) => setC("wall_ext_gf_size", e.target.value)}>
              <option value="">Select...</option>
              {WALL_BATT_SIZES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="External walls FF m²">
            <M2Input value={checklist.wall_ext_ff_m2} onChange={(v) => setC("wall_ext_ff_m2", v)} />
          </Field>
          <Field label="FF batt size">
            <select className={inputCls} value={checklist.wall_ext_ff_size} onChange={(e) => setC("wall_ext_ff_size", e.target.value)}>
              <option value="">Select...</option>
              {WALL_BATT_SIZES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="External R rating">
            <input className={inputCls} placeholder="e.g. R2.5" value={checklist.wall_r_rating} onChange={(e) => setC("wall_r_rating", e.target.value)} />
          </Field>
          <Field label="Internal / acoustic walls m²">
            <M2Input value={checklist.wall_int_m2} onChange={(v) => setC("wall_int_m2", v)} />
          </Field>
          <Field label="Internal R rating">
            <input className={inputCls} placeholder="e.g. R2.7" value={checklist.wall_int_r_rating} onChange={(e) => setC("wall_int_r_rating", e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <Group label="Suitability">
            {CEILING_SUITABILITY.map((o) => (
              <Toggle key={o} on={checklist.wall_suitability.includes(o)} onClick={() => toggleIn("wall_suitability", o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <Group label="Wall access">
            {ACCESS_LEVELS.map((o) => (
              <Toggle key={o} tone={accessTone(o)} on={checklist.wall_access.includes(o)} onClick={() => toggleIn("wall_access", o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <Field label="Wall notes">
            <textarea rows={3} className={inputCls} value={checklist.wall_notes} onChange={(e) => setC("wall_notes", e.target.value)} placeholder="e.g. Stud spacing 450 downstairs, 600 upstairs. Double layer to M1 walls." />
          </Field>
        </div>
      </Section>

      {/* Underfloor */}
      <Section title="Underfloor batts" muted={!checklist.quote_underfloor} hint={!checklist.quote_underfloor ? "Tick Underfloor batts above if you're quoting underfloor." : undefined}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="415 m²">
            <M2Input value={checklist.underfloor_415_m2} onChange={(v) => setC("underfloor_415_m2", v)} />
          </Field>
          <Field label="565 m²">
            <M2Input value={checklist.underfloor_565_m2} onChange={(v) => setC("underfloor_565_m2", v)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <Group label="Product">
            {UNDERFLOOR_PRODUCTS.map((o) => (
              <Toggle key={o} on={checklist.underfloor_products.includes(o)} onClick={() => toggleIn("underfloor_products", o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <Group label="Suitability">
            {UNDERFLOOR_SUITABILITY.map((o) => (
              <Toggle key={o} on={checklist.underfloor_suitability.includes(o)} onClick={() => toggleIn("underfloor_suitability", o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <Group label="Underfloor access">
            {ACCESS_LEVELS.map((o) => (
              <Toggle key={o} tone={accessTone(o)} on={checklist.underfloor_access.includes(o)} onClick={() => toggleIn("underfloor_access", o)}>
                {o}
              </Toggle>
            ))}
          </Group>
          <RoomCalc
            area="Underfloor"
            rooms={checklist.rooms}
            onRooms={(r) => setC("rooms", r)}
            targets={[
              { label: "415", apply: (t) => setC("underfloor_415_m2", String(t)) },
              { label: "565", apply: (t) => setC("underfloor_565_m2", String(t)) },
            ]}
          />
        </div>
      </Section>
        </>
      )}

      {/* Notes */}
      <Section title="Notes">
        <textarea
          rows={6}
          className={inputCls}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder={"e.g. Quote supply and install.\nCan only do living and dining — not enough height elsewhere.\nInstall up to the pipes marked pink on the plan."}
        />
      </Section>

      {/* Photos */}
      <Section title="Photos & site plan">
        <SiteVisitPhotos initial={photos} visitId={visitId} ensureVisitId={ensureVisitId} />
      </Section>

      {/* Sticky save bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <span
            className={`text-sm ${
              saveState === "error" ? "font-medium text-red-700" : saveState === "dirty" ? "text-[var(--brand-gold-dark)]" : "text-[var(--muted)]"
            }`}
            aria-live="polite"
          >
            {liveNote ? <span className="font-medium text-blue-700">{liveNote}</span> : statusLine}
          </span>
          <button
            onClick={() => saveNow({ audit: true })}
            disabled={saveState === "saving"}
            className="rounded-lg bg-[var(--brand-gold)] px-6 py-2.5 text-sm font-semibold text-[#201f1c] disabled:opacity-60"
          >
            {visitId ? "Save" : "Save visit"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function accessTone(o: string): "good" | "warn" | "bad" | undefined {
  if (o === "Excellent" || o === "Good") return "good";
  if (o === "Hard" || o === "Limited") return "warn";
  if (o === "Can't do") return "bad";
  return undefined;
}

function Section({ title, children, muted, hint }: { title: string; children: React.ReactNode; muted?: boolean; hint?: string }) {
  return (
    <section className={`mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 ${muted ? "opacity-80" : ""}`}>
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

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <span className="w-32 shrink-0 pt-2 text-sm text-[var(--muted)]">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
  tone,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  const onCls =
    tone === "bad"
      ? "border-red-700 bg-red-700 text-white"
      : tone === "warn"
      ? "border-[#b1841f] bg-[#b1841f] text-white"
      : tone === "good"
      ? "border-[#1f6b35] bg-[#1f6b35] text-white"
      : "border-[#201f1c] bg-[#201f1c] text-white";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
        on ? onCls : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#c9c5bb]"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--border)] p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`flex-1 rounded-md px-2 py-2 text-sm font-medium ${value === o ? "bg-[#201f1c] text-white" : "text-[var(--muted)]"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function M2Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        className={`${inputCls} pr-10 font-mono tabular-nums`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="0"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">m²</span>
    </div>
  );
}

/** Room-by-room L × W so the m² can be worked out on site and dropped into a batt size. */
function RoomCalc({
  area,
  rooms,
  onRooms,
  targets,
}: {
  area: Room["area"];
  rooms: Room[];
  onRooms: (r: Room[]) => void;
  targets: { label: string; apply: (total: number) => void }[];
}) {
  const mine = rooms.filter((r) => r.area === area);
  const [open, setOpen] = useState(mine.length > 0);
  const total = Math.round(mine.reduce((s, r) => s + roomArea(r), 0) * 100) / 100;

  function update(id: string, patch: Partial<Room>) {
    onRooms(rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function add() {
    onRooms([...rooms, { id: Math.random().toString(36).slice(2, 10), area, name: "", length: "", width: "" }]);
    setOpen(true);
  }

  if (!open) {
    return (
      <button type="button" onClick={add} className="self-start text-sm font-medium text-accent hover:underline">
        + Work out m² room by room
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[#f8f7f4] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Rooms (length × width, metres)</div>
      <div className="flex flex-col gap-2">
        {mine.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_4.5rem_auto_4.5rem_auto] items-center gap-1.5 sm:grid-cols-[1fr_5.5rem_auto_5.5rem_5rem_auto]">
            <input
              className="min-w-0 rounded-md border border-[var(--border)] bg-white px-2 py-2 text-base sm:text-sm"
              placeholder="Room"
              value={r.name}
              onChange={(e) => update(r.id, { name: e.target.value })}
            />
            <input
              inputMode="decimal"
              className="min-w-0 rounded-md border border-[var(--border)] bg-white px-2 py-2 text-right font-mono text-base sm:text-sm"
              placeholder="L"
              value={r.length}
              onChange={(e) => update(r.id, { length: e.target.value.replace(/[^0-9.]/g, "") })}
            />
            <span className="text-[var(--muted)]">×</span>
            <input
              inputMode="decimal"
              className="min-w-0 rounded-md border border-[var(--border)] bg-white px-2 py-2 text-right font-mono text-base sm:text-sm"
              placeholder="W"
              value={r.width}
              onChange={(e) => update(r.id, { width: e.target.value.replace(/[^0-9.]/g, "") })}
            />
            <span className="hidden text-right font-mono text-sm tabular-nums sm:block">{roomArea(r) || "—"}</span>
            <button
              type="button"
              onClick={() => onRooms(rooms.filter((x) => x.id !== r.id))}
              className="px-1.5 text-lg leading-none text-[var(--muted)] hover:text-red-700"
              aria-label={`Remove ${r.name || "room"}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={add} className="text-sm font-medium text-accent hover:underline">
          + Add room
        </button>
        <span className="ml-auto font-mono text-sm font-semibold tabular-nums">Total {total} m²</span>
      </div>
      {total > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-sm">
          <span className="text-[var(--muted)]">Use total for</span>
          {targets.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => t.apply(total)}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 font-medium hover:border-[var(--brand-gold-dark)]"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

