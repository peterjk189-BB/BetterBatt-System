"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import {
  ANSWERS,
  INSPECTION_STATUSES,
  RESULTS,
  SECTIONS,
  STATUS_STYLES,
  inspectionLabel,
  normaliseSection,
  type Answer,
  type InspectionPhoto,
  type InspectionPrefill,
  type InspectionRecord,
  type InspectionResult,
  type InspectionStatus,
  type SectionData,
  type SectionDef,
  type SectionKey,
} from "@/lib/inspections";
import InspectionPhotos from "./InspectionPhotos";
import SignaturePad from "./SignaturePad";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base sm:text-sm focus:border-[var(--brand-gold-dark)] focus:outline-none";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ANSWER_ON: Record<string, string> = {
  Yes: "border-[#1f6b35] bg-[#1f6b35] text-white",
  No: "border-[#9b1c1c] bg-[#9b1c1c] text-white",
  NA: "border-[#5f6062] bg-[#5f6062] text-white",
};

export default function InspectionEditor({
  record,
  photos,
  prefill,
  isAdmin,
  related,
}: {
  record: (InspectionRecord & { work_orders?: { wo_number: string } | null; projects?: { quote_number: number } | null }) | null;
  photos: InspectionPhoto[];
  prefill: InspectionPrefill | null;
  isAdmin: boolean;
  /** For a saved inspection: the FAILed one it re-inspects, and any re-inspections of it. */
  related?: { parent: { id: string; inspection_number: number } | null; children: { id: string; inspection_number: number; result: string | null }[] };
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [number, setNumber] = useState<number | null>(record?.inspection_number ?? null);
  const [form, setForm] = useState({
    inspection_date: record?.inspection_date || todayLocal(),
    inspection_time: record?.inspection_time?.slice(0, 5) || "",
    status: (record?.status || "Draft") as InspectionStatus,
    builder_name: record?.builder_name || prefill?.builder_name || "",
    site_address: record?.site_address || prefill?.site_address || "",
    suburb: record?.suburb || prefill?.suburb || "",
    contractor: record ? record.contractor || "" : prefill?.contractor || "Better Batt Insulation",
    sales_order: record?.sales_order || prefill?.sales_order || "",
    audit_region: record?.audit_region || prefill?.audit_region || "",
    include_foil: record?.include_foil ?? prefill?.include_foil ?? false,
    include_wall: record?.include_wall ?? prefill?.include_wall ?? false,
    include_ceiling: record?.include_ceiling ?? prefill?.include_ceiling ?? false,
    result: (record?.result || "") as InspectionResult | "",
    maintenance: (record?.maintenance || "") as "Yes" | "No" | "",
    rectifications: record?.rectifications || "",
    inspector_name: record?.inspector_name || "",
    installer_name: record?.installer_name || prefill?.installer_name || "",
    inspector_signature: record?.inspector_signature || null as string | null,
    signed_at: record?.signed_at || null as string | null,
    work_order_id: record?.work_order_id || prefill?.work_order_id || "",
    project_id: record?.project_id || prefill?.project_id || "",
    parent_inspection_id: record?.parent_inspection_id || prefill?.parent_inspection_id || "",
  });
  const [sections, setSections] = useState<Record<SectionKey, SectionData>>({
    foil: normaliseSection(record ? record.foil : prefill?.sections?.foil),
    wall: normaliseSection(record ? record.wall : prefill?.sections?.wall),
    ceiling: normaliseSection(record ? record.ceiling : prefill?.sections?.ceiling),
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const creating = useRef<Promise<string | null> | null>(null);
  const firstRender = useRef(true);

  const payload = useCallback(
    () => ({
      inspection_date: form.inspection_date,
      inspection_time: form.inspection_time || null,
      status: form.status,
      builder_name: form.builder_name.trim() || null,
      site_address: form.site_address.trim() || null,
      suburb: form.suburb.trim() || null,
      contractor: form.contractor.trim() || null,
      sales_order: form.sales_order.trim() || null,
      audit_region: form.audit_region.trim() || null,
      include_foil: form.include_foil,
      include_wall: form.include_wall,
      include_ceiling: form.include_ceiling,
      result: form.result || null,
      maintenance: form.maintenance || null,
      rectifications: form.rectifications || null,
      inspector_name: form.inspector_name.trim() || null,
      installer_name: form.installer_name.trim() || null,
      inspector_signature: form.inspector_signature,
      signed_at: form.signed_at,
      work_order_id: form.work_order_id || null,
      project_id: form.project_id || null,
      parent_inspection_id: form.parent_inspection_id || null,
      foil: sections.foil,
      wall: sections.wall,
      ceiling: sections.ceiling,
    }),
    [form, sections]
  );

  const ensureId = useCallback(async (): Promise<string | null> => {
    if (id) return id;
    if (creating.current) return creating.current;
    if (!form.work_order_id) {
      setError("An inspection must be linked to a work order. Go back and pick the work order first.");
      return null;
    }
    if (!form.site_address.trim() && !form.builder_name.trim()) {
      setError("Enter the site address or builder first.");
      return null;
    }
    creating.current = (async () => {
      setSaveState("saving");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error: insErr } = await supabase
        .from("inspections")
        .insert({ ...payload(), created_by: user?.id ?? null })
        .select("id, inspection_number, site_address")
        .single();
      if (insErr || !data) {
        setSaveState("error");
        setError(insErr?.message || "Couldn't create the inspection.");
        creating.current = null;
        return null;
      }
      setId(data.id);
      setNumber(data.inspection_number);
      setSaveState("saved");
      setSavedAt(new Date());
      setError(null);
      window.history.replaceState(null, "", `/dashboard/inspections/${data.id}`);
      logAudit(supabase, { eventType: "create", entityType: "Inspection", entityId: data.id, entityLabel: inspectionLabel(data) });
      return data.id as string;
    })();
    return creating.current;
  }, [id, form.work_order_id, form.site_address, form.builder_name, payload, supabase]);

  const saveNow = useCallback(
    async (opts?: { audit?: boolean }) => {
      if (!id) {
        await ensureId();
        return;
      }
      setSaveState("saving");
      const { error: upErr } = await supabase.from("inspections").update(payload()).eq("id", id);
      if (upErr) {
        setSaveState("error");
        setError(upErr.message);
        return;
      }
      setSaveState("saved");
      setSavedAt(new Date());
      setError(null);
      if (opts?.audit && number) {
        logAudit(supabase, { eventType: "update", entityType: "Inspection", entityId: id, entityLabel: `INS${number}` });
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
  }, [form, sections]);

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

  function patchSection(key: SectionKey, fn: (s: SectionData) => SectionData) {
    setSections((all) => ({ ...all, [key]: fn(all[key]) }));
    startedFilling();
  }

  // A booked (Scheduled) inspection becomes a Draft as soon as anyone starts filling it in.
  function startedFilling() {
    setForm((f) => (f.status === "Scheduled" ? { ...f, status: "Draft" } : f));
  }

  async function toggleArchive() {
    if (!id) return;
    const archiving = !record?.archived;
    if (archiving && !confirm(`Archive INS${number}?`)) return;
    await supabase.from("inspections").update({ archived: archiving }).eq("id", id);
    logAudit(supabase, {
      eventType: archiving ? "delete" : "update",
      entityType: "Inspection",
      entityId: id,
      entityLabel: `INS${number}`,
      details: archiving ? "Archived" : "Restored",
    });
    router.push("/dashboard/inspections");
    router.refresh();
  }

  const included = SECTIONS.filter((s) => form[s.includeField]);
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
          <Link href="/dashboard/inspections" className="text-sm text-[var(--muted)] hover:underline">
            &larr; Inspections
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{number ? `INS${number}` : "New inspection"}</h1>
        </div>
        {id && (
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button onClick={toggleArchive} className="px-2 text-sm text-[var(--muted)] hover:underline">
                {record?.archived ? "Restore" : "Archive"}
              </button>
            )}
            {form.result === "FAIL" && (related?.children.length ?? 0) === 0 && (
              <Link
                href={`/dashboard/inspections/new?reinspect=${id}`}
                className="rounded-lg bg-[#9b1c1c] px-4 py-2 text-sm font-semibold text-white"
              >
                Re-inspect
              </Link>
            )}
            <Link
              href={`/dashboard/inspections/${id}/print`}
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

      {!record && prefill?.source && (
        <div className="mt-4 rounded-lg border border-[#f3d48a] bg-[#fff8e6] px-4 py-2.5 text-sm text-[#5c440b]">{prefill.source}</div>
      )}
      {related?.parent && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Re-inspection of{" "}
          <Link href={`/dashboard/inspections/${related.parent.id}`} className="font-medium text-accent hover:underline">
            INS{related.parent.inspection_number}
          </Link>
        </p>
      )}
      {related && related.children.length > 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Re-inspected in{" "}
          {related.children.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link href={`/dashboard/inspections/${c.id}`} className="font-medium text-accent hover:underline">
                INS{c.inspection_number}
              </Link>
              {c.result ? ` (${c.result})` : ""}
            </span>
          ))}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {INSPECTION_STATUSES.map((s) => (
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
          <Field label={form.status === "Scheduled" ? "Booked for" : "Date"}>
            <input type="date" className={inputCls} value={form.inspection_date} onChange={(e) => set("inspection_date", e.target.value)} />
          </Field>
          <Field label="Time">
            <input type="time" className={inputCls} value={form.inspection_time} onChange={(e) => set("inspection_time", e.target.value)} />
          </Field>
          <Field label="Builder" className="col-span-2">
            <input className={inputCls} value={form.builder_name} onChange={(e) => set("builder_name", e.target.value)} />
          </Field>
          <Field label="Site address" className="col-span-2">
            <input className={inputCls} value={form.site_address} onChange={(e) => set("site_address", e.target.value)} />
          </Field>
          <Field label="Suburb" className="col-span-2">
            <input className={inputCls} value={form.suburb} onChange={(e) => set("suburb", e.target.value)} />
          </Field>
          <Field label="Contractor" className="col-span-2">
            <input className={inputCls} value={form.contractor} onChange={(e) => set("contractor", e.target.value)} />
          </Field>
          <Field label="Sales order">
            <input className={inputCls} value={form.sales_order} onChange={(e) => set("sales_order", e.target.value)} />
          </Field>
          <Field label="Audit region">
            <input className={inputCls} value={form.audit_region} onChange={(e) => set("audit_region", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="What's being inspected" hint="Tick each inspection this report covers. Only ticked sections are shown below and printed on the report.">
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <Toggle key={s.key} on={form[s.includeField]} onClick={() => set(s.includeField, !form[s.includeField])}>
              {s.label}
            </Toggle>
          ))}
        </div>
        {included.length === 0 && (
          <p className="mt-3 text-sm text-[var(--brand-gold-dark)]">Tick at least one inspection to show its checklist.</p>
        )}
      </Section>

      {included.map((def) => (
        <ChecklistSection key={def.key} def={def} data={sections[def.key]} onChange={(fn) => patchSection(def.key, fn)} />
      ))}

      <Section title="Result">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <span className="text-sm text-[var(--muted)]">Result</span>
            <div className="mt-1 flex gap-2">
              {RESULTS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    set("result", form.result === r ? "" : r);
                    startedFilling();
                  }}
                  className={`min-h-[44px] rounded-lg border px-5 text-sm font-bold ${
                    form.result === r
                      ? r === "PASS"
                        ? "border-[#1f6b35] bg-[#1f6b35] text-white"
                        : "border-[#9b1c1c] bg-[#9b1c1c] text-white"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-sm text-[var(--muted)]">Maintenance</span>
            <div className="mt-1 flex gap-2">
              {(["Yes", "No"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("maintenance", form.maintenance === m ? "" : m)}
                  className={`min-h-[44px] rounded-lg border px-5 text-sm font-semibold ${
                    form.maintenance === m ? "border-[#201f1c] bg-[#201f1c] text-white" : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Field label="Rectifications" className="mt-4">
          <textarea
            rows={4}
            className={inputCls}
            value={form.rectifications}
            onChange={(e) => set("rectifications", e.target.value)}
            placeholder="What was found and what was done to fix it"
          />
        </Field>
      </Section>

      <Section title="Photos" hint="Add a caption under each photo — e.g. “Wall not done”, then “Rectified by Allan” on the after shot.">
        <InspectionPhotos initial={photos} ensureInspectionId={ensureId} />
      </Section>

      <Section title="Sign-off">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Inspector name">
            <input className={inputCls} value={form.inspector_name} onChange={(e) => set("inspector_name", e.target.value)} />
          </Field>
          <Field label="Installer / rectified by">
            <input className={inputCls} value={form.installer_name} onChange={(e) => set("installer_name", e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <span className="text-sm text-[var(--muted)]">Inspector signature</span>
          <div className="mt-1">
            <SignaturePad
              value={form.inspector_signature}
              onSave={(url) => setForm((f) => ({ ...f, inspector_signature: url, signed_at: url ? new Date().toISOString() : null }))}
            />
          </div>
          {form.signed_at && <p className="mt-1 text-xs text-[var(--muted)]">Signed {new Date(form.signed_at).toLocaleString("en-AU")}</p>}
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
            {id ? "Save" : "Save inspection"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChecklistSection({
  def,
  data,
  onChange,
}: {
  def: SectionDef;
  data: SectionData;
  onChange: (fn: (s: SectionData) => SectionData) => void;
}) {
  function setAnswer(item: string, a: Answer) {
    onChange((s) => ({ ...s, checks: { ...s.checks, [item]: s.checks[item] === a ? "" : a } }));
  }
  function setAllYes() {
    onChange((s) => {
      const checks = { ...s.checks };
      // Never auto-pass a line that failed last time — those need a deliberate answer.
      for (const item of def.checks) if (!checks[item] && !s.flagged.includes(item)) checks[item] = "Yes";
      return { ...s, checks };
    });
  }

  return (
    <Section title={def.title}>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {def.options.map((opt) => (
          <div key={opt} className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[#b1841f]"
                checked={!!data.options[opt]}
                onChange={(e) => onChange((s) => ({ ...s, options: { ...s.options, [opt]: e.target.checked } }))}
              />
              {opt}
            </label>
            {def.optionNotes.includes(opt) && (
              <input
                className="w-36 rounded-lg border border-[var(--border)] px-2 py-1.5 text-base sm:text-sm"
                value={data.notes[opt] || ""}
                onChange={(e) => onChange((s) => ({ ...s, notes: { ...s.notes, [opt]: e.target.value } }))}
                aria-label={`${opt} note`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={setAllYes} className="text-sm font-medium text-accent hover:underline">
          Mark unanswered as Yes
        </button>
      </div>

      <div className="mt-1 divide-y divide-[var(--border)]">
        {def.checks.map((item) => {
          const flagged = data.flagged.includes(item);
          return (
          <div key={item} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${flagged ? "-mx-2 rounded-lg bg-[#fdf1f1] px-2" : ""}`}>
            <span className="min-w-0 flex-1 text-sm">
              {item}
              {flagged && <span className="ml-2 rounded-full bg-[#9b1c1c] px-2 py-0.5 text-[11px] font-semibold text-white">Failed last time</span>}
            </span>
            <div className="flex items-center gap-1.5">
              {def.checkNotes.includes(item) && (
                <input
                  className="w-24 rounded-lg border border-[var(--border)] px-2 py-1.5 text-base sm:text-sm"
                  value={data.notes[item] || ""}
                  onChange={(e) => onChange((s) => ({ ...s, notes: { ...s.notes, [item]: e.target.value } }))}
                  aria-label={`${item} note`}
                />
              )}
              {ANSWERS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAnswer(item, a)}
                  className={`min-h-[40px] min-w-[3rem] rounded-lg border px-2.5 text-sm font-medium ${
                    data.checks[item] === a ? ANSWER_ON[a] : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          );
        })}
      </div>

      {def.extras.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {def.extras.map((x) => (
            <Toggle key={x} on={!!data.extras[x]} onClick={() => onChange((s) => ({ ...s, extras: { ...s.extras, [x]: !s.extras[x] } }))}>
              {x}
            </Toggle>
          ))}
        </div>
      )}

      <Field label="Comments" className="mt-4">
        <textarea rows={3} className={inputCls} value={data.comments} onChange={(e) => onChange((s) => ({ ...s, comments: e.target.value }))} />
      </Field>
    </Section>
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
