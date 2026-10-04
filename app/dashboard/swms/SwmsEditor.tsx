"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import {
  EMPTY_HAZARDS,
  EMPTY_SITE_REPORT,
  FOILING_JOB_TYPES,
  JOB_TYPES,
  PHOTO_ITEMS,
  SCOPE_ITEMS,
  SITE_REPORT_COLUMNS,
  SWMS_STATUSES,
  STATUS_STYLES,
  normaliseHazards,
  normaliseInstallers,
  normalisePhotosChecklist,
  normaliseScope,
  normaliseSiteReport,
  swmsLabel,
  type HazardRow,
  type Installer,
  type JobType,
  type Scope,
  type SiteReport,
  type SwmsPhoto,
  type SwmsRecord,
} from "@/lib/swms";
import SwmsPhotos from "./SwmsPhotos";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base sm:text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowLocal() {
  const d = new Date();
  return d.toISOString();
}

export default function SwmsEditor({
  record,
  photos,
  prefill,
  isAdmin,
}: {
  record: (SwmsRecord & { work_orders?: { wo_number: string } | null; projects?: { quote_number: number } | null }) | null;
  photos: SwmsPhoto[];
  prefill: { work_order_id?: string; project_id?: string; site_address?: string; suburb?: string; builder_name?: string } | null;
  isAdmin: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [number, setNumber] = useState<number | null>(record?.swms_number ?? null);
  const [form, setForm] = useState({
    job_date: record?.job_date || todayLocal(),
    time_in: record?.time_in?.slice(0, 5) || "",
    time_out: record?.time_out?.slice(0, 5) || "",
    job_type: (record?.job_type || "Ceiling") as JobType,
    status: record?.status || "Draft",
    builder_name: record?.builder_name || prefill?.builder_name || "",
    site_address: record?.site_address || prefill?.site_address || "",
    suburb: record?.suburb || prefill?.suburb || "",
    work_order_id: record?.work_order_id || prefill?.work_order_id || "",
    project_id: record?.project_id || prefill?.project_id || "",
    comments: record?.comments || "",
  });
  const [scope, setScope] = useState<Scope>(record ? normaliseScope(record.scope) : normaliseScope({}));
  const [hazards, setHazards] = useState<HazardRow[]>(record ? normaliseHazards(record.hazards) : EMPTY_HAZARDS);
  const [siteReport, setSiteReport] = useState<SiteReport>(record ? normaliseSiteReport(record.site_report) : EMPTY_SITE_REPORT);
  const [photosChecklist, setPhotosChecklist] = useState<Record<string, boolean>>(
    record ? normalisePhotosChecklist(record.photos_checklist) : normalisePhotosChecklist({})
  );
  const [installers, setInstallers] = useState<Installer[]>(record ? normaliseInstallers(record.installers) : []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const creating = useRef<Promise<string | null> | null>(null);
  const firstRender = useRef(true);

  function switchJobType(jt: JobType) {
    setForm((f) => ({ ...f, job_type: jt }));
  }

  const payload = useCallback(
    () => ({
      job_date: form.job_date,
      time_in: form.time_in || null,
      time_out: form.time_out || null,
      job_type: form.job_type,
      status: form.status,
      builder_name: form.builder_name.trim() || null,
      site_address: form.site_address.trim() || null,
      suburb: form.suburb.trim() || null,
      work_order_id: form.work_order_id || null,
      project_id: form.project_id || null,
      comments: form.comments || null,
      scope,
      hazards,
      site_report: siteReport,
      photos_checklist: photosChecklist,
      installers,
    }),
    [form, scope, hazards, siteReport, photosChecklist, installers]
  );

  const ensureId = useCallback(async (): Promise<string | null> => {
    if (id) return id;
    if (creating.current) return creating.current;
    if (!form.site_address.trim() && !form.builder_name.trim()) {
      setError("Enter the site address or builder name first.");
      return null;
    }
    creating.current = (async () => {
      setSaveState("saving");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error: insErr } = await supabase
        .from("swms")
        .insert({ ...payload(), created_by: user?.id ?? null })
        .select("id, swms_number, site_address")
        .single();
      if (insErr || !data) {
        setSaveState("error");
        setError(insErr?.message || "Couldn't create the SWMS.");
        creating.current = null;
        return null;
      }
      setId(data.id);
      setNumber(data.swms_number);
      setSaveState("saved");
      setSavedAt(new Date());
      setError(null);
      window.history.replaceState(null, "", `/dashboard/swms/${data.id}`);
      logAudit(supabase, { eventType: "create", entityType: "SWMS/JSA", entityId: data.id, entityLabel: swmsLabel(data) });
      return data.id as string;
    })();
    return creating.current;
  }, [id, form.site_address, form.builder_name, payload, supabase]);

  const saveNow = useCallback(
    async (opts?: { audit?: boolean }) => {
      if (!id) {
        await ensureId();
        return;
      }
      setSaveState("saving");
      const { error: upErr } = await supabase.from("swms").update(payload()).eq("id", id);
      if (upErr) {
        setSaveState("error");
        setError(upErr.message);
        return;
      }
      setSaveState("saved");
      setSavedAt(new Date());
      setError(null);
      if (opts?.audit && number) {
        logAudit(supabase, { eventType: "update", entityType: "SWMS/JSA", entityId: id, entityLabel: `SWMS${number}` });
      }
    },
    [id, ensureId, payload, supabase, number]
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("dirty");
    if (!id) return;
    const t = setTimeout(() => saveNow(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, scope, hazards, siteReport, photosChecklist, installers]);

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

  function updateHazard(hid: string, patch: Partial<HazardRow>) {
    setHazards((rows) => rows.map((r) => (r.id === hid ? { ...r, ...patch } : r)));
  }
  function addHazardRow() {
    setHazards((rows) => [...rows, { id: `h${Date.now()}`, task: "", hazards: "", present: false, controls: "", controlled: false }]);
  }
  function removeHazardRow(hid: string) {
    setHazards((rows) => rows.filter((r) => r.id !== hid));
  }

  function addInstaller() {
    setInstallers((list) => [...list, { name: "", signed_name: "", signed_at: null }]);
  }
  function updateInstaller(i: number, patch: Partial<Installer>) {
    setInstallers((list) => list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeInstaller(i: number) {
    setInstallers((list) => list.filter((_, idx) => idx !== i));
  }
  function signInstaller(i: number) {
    const name = installers[i].name.trim();
    if (!name) {
      setError("Enter the installer's name before signing.");
      return;
    }
    updateInstaller(i, { signed_name: name, signed_at: nowLocal() });
  }

  async function toggleArchive() {
    if (!id) return;
    const archiving = !record?.archived;
    if (archiving && !confirm(`Archive SWMS${number}?`)) return;
    await supabase.from("swms").update({ archived: archiving }).eq("id", id);
    logAudit(supabase, {
      eventType: archiving ? "delete" : "update",
      entityType: "SWMS/JSA",
      entityId: id,
      entityLabel: `SWMS${number}`,
      details: archiving ? "Archived" : "Restored",
    });
    router.push("/dashboard/swms");
    router.refresh();
  }

  const woNumber = record?.work_orders?.wo_number;
  const quoteNumber = record?.projects?.quote_number;
  const statusLine =
    saveState === "saving"
      ? "Saving…"
      : saveState === "error"
      ? "Not saved — check signal"
      : saveState === "dirty"
      ? id
        ? "Unsaved changes"
        : "Not saved yet"
      : savedAt
      ? `Saved ${savedAt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`
      : id
      ? "All changes saved"
      : "Not saved yet";

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/swms" className="text-sm text-[var(--muted)] hover:underline">
            &larr; SWMS / JSA
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{number ? `SWMS${number}` : "New SWMS / JSA"}</h1>
        </div>
        {id && (
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button onClick={toggleArchive} className="px-2 text-sm text-[var(--muted)] hover:underline">
                {record?.archived ? "Restore" : "Archive"}
              </button>
            )}
            <Link
              href={`/dashboard/swms/${id}/print`}
              target="_blank"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)]"
            >
              Print / PDF
            </Link>
            {woNumber && (
              <Link href={`/dashboard/work-orders/${form.work_order_id}`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium">
                Open WO {woNumber}
              </Link>
            )}
            {quoteNumber && (
              <Link href={`/dashboard/quotes/${form.project_id}`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium">
                Open quote Q{quoteNumber}
              </Link>
            )}
          </div>
        )}
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      <div className="mt-5 flex flex-wrap gap-2">
        {SWMS_STATUSES.map((s) => (
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

      <Section title="Job details">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Job date">
            <input type="date" className={inputCls} value={form.job_date} onChange={(e) => set("job_date", e.target.value)} />
          </Field>
          <Field label="Time in">
            <input type="time" className={inputCls} value={form.time_in} onChange={(e) => set("time_in", e.target.value)} />
          </Field>
          <Field label="Time out">
            <input type="time" className={inputCls} value={form.time_out} onChange={(e) => set("time_out", e.target.value)} />
          </Field>
          <Field label="Job type">
            <select className={inputCls} value={form.job_type} onChange={(e) => switchJobType(e.target.value as JobType)}>
              {JOB_TYPES.map((jt) => (
                <option key={jt} value={jt}>
                  {jt}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Builder / customer" className="col-span-2">
            <input className={inputCls} value={form.builder_name} onChange={(e) => set("builder_name", e.target.value)} />
          </Field>
          <Field label="Site address" className="col-span-2">
            <input className={inputCls} value={form.site_address} onChange={(e) => set("site_address", e.target.value)} />
          </Field>
          <Field label="Suburb" className="col-span-2">
            <input className={inputCls} value={form.suburb} onChange={(e) => set("suburb", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Scope of work">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {SCOPE_ITEMS.map((item) => (
            <label key={item} className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#b1841f]"
                checked={!!scope.items[item]}
                onChange={(e) => setScope((s) => ({ ...s, items: { ...s.items, [item]: e.target.checked } }))}
              />
              {item}
            </label>
          ))}
        </div>
        <Field label="Repair" className="mt-3 max-w-sm">
          <input className={inputCls} value={scope.repair_note} onChange={(e) => setScope((s) => ({ ...s, repair_note: e.target.value }))} />
        </Field>
      </Section>

      <Section title="Site report" hint="Tick anything that applies, checked before installers start work.">
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-3">
          {SITE_REPORT_COLUMNS.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-1">
              {col.map((item) => (
                <label key={item} className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#b1841f]"
                    checked={!!siteReport.items[item]}
                    onChange={(e) => setSiteReport((s) => ({ ...s, items: { ...s.items, [item]: e.target.checked } }))}
                  />
                  {item}
                </label>
              ))}
            </div>
          ))}
        </div>
        <Field label="Other" className="mt-2">
          <input
            className={inputCls}
            value={siteReport.other_note}
            onChange={(e) => setSiteReport((s) => ({ ...s, other_note: e.target.value }))}
            placeholder="Anything else noticed on site"
          />
        </Field>

        <div className="mt-4 flex flex-wrap gap-2">
          <Toggle on={siteReport.power_isolated_tagged} onClick={() => setSiteReport((s) => ({ ...s, power_isolated_tagged: !s.power_isolated_tagged }))}>
            Power isolated and tagged (photo)
          </Toggle>
          <Toggle on={siteReport.power_restored} onClick={() => setSiteReport((s) => ({ ...s, power_restored: !s.power_restored }))}>
            Power restored
          </Toggle>
        </div>

        <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-[var(--brand-grey)]">Stud centres</h3>
        <p className={`mt-1 text-xs ${FOILING_JOB_TYPES.includes(form.job_type) ? "font-medium text-[var(--brand-gold-dark)]" : "text-[var(--muted)]"}`}>
          If this SWMS is a foiling job, please record the stud centre for the external wall, internal walls, mid floor and ceilings.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="External wall">
            <input
              className={inputCls}
              value={siteReport.stud_width.external_wall}
              onChange={(e) => setSiteReport((s) => ({ ...s, stud_width: { ...s.stud_width, external_wall: e.target.value } }))}
            />
          </Field>
          <Field label="Internal walls">
            <input
              className={inputCls}
              value={siteReport.stud_width.internal_walls}
              onChange={(e) => setSiteReport((s) => ({ ...s, stud_width: { ...s.stud_width, internal_walls: e.target.value } }))}
            />
          </Field>
          <Field label="Mid floor">
            <input
              className={inputCls}
              value={siteReport.stud_width.mid_floor}
              onChange={(e) => setSiteReport((s) => ({ ...s, stud_width: { ...s.stud_width, mid_floor: e.target.value } }))}
            />
          </Field>
          <Field label="Ceilings">
            <input
              className={inputCls}
              value={siteReport.stud_width.ceiling}
              onChange={(e) => setSiteReport((s) => ({ ...s, stud_width: { ...s.stud_width, ceiling: e.target.value } }))}
            />
          </Field>
        </div>
      </Section>

      <Section title="Hazard & control measures" hint="Reviewed and agreed on site before work starts. Edit any row to suit this job.">
        <div className="flex flex-col gap-3">
          {hazards.map((h) => (
            <div key={h.id} className="rounded-lg border border-[var(--border)] bg-[#f8f7f4] p-3">
              <div className="flex items-start gap-2">
                <input
                  className={`${inputCls} bg-white font-medium`}
                  placeholder="Task"
                  value={h.task}
                  onChange={(e) => updateHazard(h.id, { task: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeHazardRow(h.id)}
                  className="shrink-0 px-2 py-2 text-lg leading-none text-[var(--muted)] hover:text-red-700"
                  aria-label="Remove row"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Field label="Hazards">
                    <textarea rows={2} className={`${inputCls} bg-white`} value={h.hazards} onChange={(e) => updateHazard(h.id, { hazards: e.target.value })} />
                  </Field>
                  <label className="mt-1.5 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-[#b1841f]"
                      checked={h.present}
                      onChange={(e) => updateHazard(h.id, { present: e.target.checked })}
                    />
                    Hazard present
                  </label>
                </div>
                <div>
                  <Field label="Control measures">
                    <textarea rows={2} className={`${inputCls} bg-white`} value={h.controls} onChange={(e) => updateHazard(h.id, { controls: e.target.value })} />
                  </Field>
                  <label className="mt-1.5 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-[#1f6b35]"
                      checked={h.controlled}
                      onChange={(e) => updateHazard(h.id, { controlled: e.target.checked })}
                    />
                    Hazard controlled
                  </label>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addHazardRow} className="self-start text-sm font-medium text-accent hover:underline">
            + Add a task
          </button>
        </div>
      </Section>

      <Section title="Photos taken">
        <div className="flex flex-col gap-2">
          {PHOTO_ITEMS.map((item) => (
            <label key={item} className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#b1841f]"
                checked={!!photosChecklist[item]}
                onChange={(e) => setPhotosChecklist((s) => ({ ...s, [item]: e.target.checked }))}
              />
              {item}
            </label>
          ))}
        </div>
        <div className="mt-4">
          <SwmsPhotos initial={photos} ensureSwmsId={ensureId} />
        </div>
      </Section>

      <Section title="Comments">
        <textarea rows={4} className={inputCls} value={form.comments} onChange={(e) => set("comments", e.target.value)} />
      </Section>

      <Section title="Installer sign-off" hint="Each installer types their name and signs to confirm they've read and understood this SWMS.">
        <div className="flex flex-col gap-3">
          {installers.map((inst, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[#f8f7f4] p-3">
              <Field label="Installer name" className="min-w-[10rem] flex-1">
                <input className={`${inputCls} bg-white`} value={inst.name} onChange={(e) => updateInstaller(i, { name: e.target.value, signed_name: "", signed_at: null })} />
              </Field>
              {inst.signed_at ? (
                <div className="rounded-lg border border-[#b7dfc2] bg-[#e6f4ea] px-3 py-2.5 text-sm text-[#1f6b35]">
                  Signed as <strong>{inst.signed_name}</strong> at {new Date(inst.signed_at).toLocaleString("en-AU")}
                </div>
              ) : (
                <button type="button" onClick={() => signInstaller(i)} className="rounded-lg bg-[#201f1c] px-4 py-2.5 text-sm font-semibold text-white">
                  Sign
                </button>
              )}
              <button type="button" onClick={() => removeInstaller(i)} className="px-2 text-sm text-[var(--muted)] hover:text-red-700">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addInstaller} className="self-start text-sm font-medium text-accent hover:underline">
            + Add installer
          </button>
        </div>
      </Section>

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
            {statusLine}
          </span>
          <button
            onClick={() => saveNow({ audit: true })}
            disabled={saveState === "saving"}
            className="rounded-lg bg-[var(--brand-gold)] px-6 py-2.5 text-sm font-semibold text-[#201f1c] disabled:opacity-60"
          >
            {id ? "Save" : "Save SWMS"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
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

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
        on ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[#c9c5bb]"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-4 w-4 items-center justify-center rounded-[4px] border text-[11px] leading-none ${
          on ? "border-white/70 bg-white/20" : "border-[#b9b5ac]"
        }`}
      >
        {on ? "✓" : ""}
      </span>
      {children}
    </button>
  );
}
