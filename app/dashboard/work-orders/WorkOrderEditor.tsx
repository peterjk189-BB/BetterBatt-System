"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import type { ProgressInspection, ProgressSwms } from "@/lib/jobProgress";
import JobProgressStrip from "./JobProgressStrip";

type Project = {
  id: string;
  quote_number: number;
  address: string | null;
  suburb: string | null;
  job_type: string;
  quote_markup: number;
  customers: { name: string } | null;
};

type Sub = { id: string; name: string; phone: string | null; email: string | null };
type LabourItem = { id: string; code: string; description: string; contractor_rate: number };
type Part = { id: string; name: string; installer_rate_per_m2?: number; coverage_m2?: number | null; is_stock_item?: boolean | null };
import { lineRate } from "@/lib/woRate";
import { woLinePacks } from "@/lib/picking";
import PartPicker from "../PartPicker";

type WorkOrder = {
  id: string;
  wo_number: string;
  project_id: string | null;
  contractor_id: string | null;
  po_number: string | null;
  po_value: number | null;
  entry_date: string | null;
  completed_date: string | null;
  jsa_received: boolean;
  notes: string | null;
  archived: boolean;
  authorised_at?: string | null;
};

type Line = {
  id?: string;
  /** Stable client-side key so a line keeps its identity before and after it is first saved. */
  uid?: string;
  part_id: string | null;
  task_date?: string | null;
  task_time?: string | null;
  completed?: boolean;
  labour_item_id?: string | null;
  /** Contractor pay per unit of qty. Defaults from the product's installer rate. */
  rate?: number | null;
  qty: number;
  subcontractor_id?: string | null;
  paid?: boolean;
  note?: string | null;
  sort_order?: number;
};

let uidCounter = 0;
function newUid() {
  uidCounter += 1;
  return `new-${Date.now()}-${uidCounter}`;
}

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function WorkOrderEditor({
  workOrder,
  lines,
  prefillHeader,
  projects,
  subs,
  labourItems,
  parts,
  isAdmin,
  canInspect = true,
  progress,
}: {
  workOrder: WorkOrder | null;
  lines: Line[];
  prefillHeader: { project_id: string; wo_number: string; po_value: number; notes?: string } | null;
  projects: Project[];
  subs: Sub[];
  labourItems: LabourItem[];
  parts: Part[];
  isAdmin: boolean;
  /** Admin/office only: contractors don't carry out inspections. */
  canInspect?: boolean;
  /** This work order's SWMS and inspections, for the job progress strip (saved work orders only). */
  progress?: { swms: ProgressSwms[]; inspections: ProgressInspection[] };
}) {
  const supabase = createClient();
  const router = useRouter();
  const isNew = !workOrder;

  const labourItemById = useMemo(() => Object.fromEntries(labourItems.map((l) => [l.id, l])), [labourItems]);
  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);
  const subById = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s])), [subs]);

  const [form, setForm] = useState({
    project_id: workOrder?.project_id || prefillHeader?.project_id || "",
    contractor_id: workOrder?.contractor_id || "",
    wo_number: workOrder?.wo_number || prefillHeader?.wo_number || "",
    po_number: workOrder?.po_number || "",
    po_value: workOrder?.po_value ?? prefillHeader?.po_value ?? 0,
    entry_date: workOrder?.entry_date || new Date().toISOString().slice(0, 10),
    completed_date: workOrder?.completed_date || "",
    jsa_received: workOrder?.jsa_received || false,
    notes: workOrder?.notes || prefillHeader?.notes || "",
  });

  const isDeliveryItem = (name: string | undefined) => /delivery/i.test(name || "");
  const selectableParts = useMemo(() => parts.filter((p) => !isDeliveryItem(p.name)), [parts]);

  const [lineItems, setLineItems] = useState<Line[]>(
    lines.length > 0
      ? lines
          .filter((l) => !isDeliveryItem(l.part_id ? partById[l.part_id]?.name : undefined))
          .map((l) => ({
            ...l,
            uid: l.id || newUid(),
            task_date: l.task_date || (workOrder ? l.task_date : form.entry_date) || null,
            completed: l.completed ?? false,
            paid: l.paid ?? false,
            rate: lineRate(
              l.rate,
              l.labour_item_id ? labourItemById[l.labour_item_id]?.contractor_rate : null,
              l.part_id ? partById[l.part_id]?.installer_rate_per_m2 : null
            ),
          }))
      : []
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Task dates follow the booking date until someone sets a different date on that line.
  function changeBookingDate(next: string) {
    const prev = form.entry_date;
    setForm((f) => ({ ...f, entry_date: next }));
    setLineItems((ls) => ls.map((l) => (!l.task_date || l.task_date === prev ? { ...l, task_date: next } : l)));
  }

  function addLine() {
    setLineItems((prev) => [
      ...prev,
      {
        uid: newUid(),
        part_id: null,
        task_date: form.entry_date || "",
        completed: false,
        labour_item_id: null,
        rate: 0,
        qty: 0,
        subcontractor_id: form.contractor_id || null,
        paid: false,
        note: "",
        sort_order: prev.length,
      },
    ]);
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLineItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function setContractor(contractorId: string) {
    setForm((f) => ({ ...f, contractor_id: contractorId }));
    // Only backfill lines that don't already have their own contractor assigned —
    // this preserves per-line overrides when a product line is split across
    // more than one contractor.
    setLineItems((prev) =>
      prev.map((l) => (l.subcontractor_id ? l : { ...l, subcontractor_id: contractorId || null }))
    );
  }

  function duplicateLine(idx: number) {
    setLineItems((prev) => {
      const source = prev[idx];
      const copy: Line = { ...source, id: undefined, uid: newUid(), sort_order: prev.length };
      return [...prev, copy];
    });
  }

  const selectedContractor = form.contractor_id ? subById[form.contractor_id] : undefined;

  const distinctLineContractorIds = Array.from(
    new Set(lineItems.map((l) => l.subcontractor_id || form.contractor_id).filter((id): id is string => !!id))
  );

  const contractorCost = lineItems.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);

  // ---- Auto-save (saved work orders only) -------------------------------------------------
  // Lines are updated in place by id (never deleted and re-created), so picking-slip progress is kept.
  const latest = useRef({ form, lineItems });
  latest.current = { form, lineItems };
  const savedIds = useRef<Set<string>>(new Set(lines.filter((l) => l.id).map((l) => l.id as string)));
  const notified = useRef<Set<string>>(
    new Set(lines.filter((l) => l.task_date).map((l) => `${l.subcontractor_id || workOrder?.contractor_id || ""}|${l.task_date}`))
  );
  const autoBusy = useRef(false);
  const autoAgain = useRef(false);
  const firstRun = useRef(true);
  const [authorisedAt, setAuthorisedAt] = useState<string | null>(workOrder?.authorised_at ?? null);
  // Before migration 0046 the column does not exist: treat the work order as authorised so nothing changes.
  const authColumn = !!workOrder && "authorised_at" in workOrder;
  const [authorising, setAuthorising] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // If a column from a newer migration is missing, retry the write without it.
  async function tryWrite(row: Record<string, any>, run: (r: Record<string, any>) => PromiseLike<{ error: { message: string } | null }>) {
    let res = await run(row);
    for (const col of ["rate", "task_time"]) {
      if (res.error && new RegExp(`\\b${col}\\b`, "i").test(res.error.message)) {
        const { [col]: _drop, ...rest } = row;
        row = rest;
        res = await run(row);
      }
    }
    return res.error ? res.error.message : null;
  }

  /** Writes the header and lines as they are on screen now. Returns an error message, or null. */
  async function persistExisting(): Promise<string | null> {
    if (!workOrder) return null;
    const { form: f, lineItems: items } = latest.current;
    if (!f.wo_number.trim()) return "Please enter a work order number.";
    const { error: hErr } = await supabase
      .from("work_orders")
      .update({
        project_id: f.project_id || null,
        contractor_id: f.contractor_id || null,
        wo_number: f.wo_number.trim(),
        po_number: f.po_number || null,
        po_value: Number(f.po_value) || 0,
        entry_date: f.entry_date || null,
        completed_date: f.completed_date || null,
        jsa_received: f.jsa_received,
        notes: f.notes || null,
      })
      .eq("id", workOrder.id);
    if (hErr) return hErr.message;

    const keep = new Set(items.filter((l) => l.id).map((l) => l.id as string));
    const gone = Array.from(savedIds.current).filter((id) => !keep.has(id));
    if (gone.length) {
      const { error: dErr } = await supabase.from("work_order_lines").delete().in("id", gone);
      if (dErr) return dErr.message;
      gone.forEach((id) => savedIds.current.delete(id));
    }

    const assigned = new Map<string, string>();
    for (let idx = 0; idx < items.length; idx++) {
      const l = items[idx];
      const row: Record<string, any> = {
        part_id: l.part_id || null,
        task_date: l.task_date || null,
        task_time: l.task_time || null,
        completed: !!l.completed,
        labour_item_id: l.labour_item_id || null,
        rate: Number(l.rate) || 0,
        qty: Number(l.qty) || 0,
        subcontractor_id: l.subcontractor_id || f.contractor_id || null,
        paid: !!l.paid,
        note: l.note || null,
        sort_order: idx,
      };
      if (l.id) {
        const err = await tryWrite(row, (r) => supabase.from("work_order_lines").update(r).eq("id", l.id as string));
        if (err) return err;
      } else {
        let newId: string | null = null;
        const err = await tryWrite({ ...row, work_order_id: workOrder.id }, async (r) => {
          const { data, error } = await supabase.from("work_order_lines").insert(r).select("id").single();
          if (data) newId = data.id;
          return { error };
        });
        if (err) return err;
        if (newId && l.uid) {
          assigned.set(l.uid, newId);
          savedIds.current.add(newId);
        }
      }
    }
    if (assigned.size) {
      setLineItems((prev) => prev.map((l) => (!l.id && l.uid && assigned.has(l.uid) ? { ...l, id: assigned.get(l.uid) } : l)));
    }
    return null;
  }

  async function runAutoSave() {
    if (autoBusy.current) {
      autoAgain.current = true;
      return;
    }
    autoBusy.current = true;
    setAutoState("saving");
    const err = await persistExisting();
    if (err) {
      setError(err);
      setAutoState("error");
    } else {
      setError(null);
      setAutoState("saved");
    }
    autoBusy.current = false;
    if (autoAgain.current) {
      autoAgain.current = false;
      runAutoSave();
    }
  }

  useEffect(() => {
    if (isNew) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(runAutoSave, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, lineItems]);

  /** Office sign-off: from now on the contractor is alerted about this work order's job dates. */
  async function authorise() {
    if (!workOrder) return;
    if (!confirm("Authorise this work order? The contractor(s) will be emailed the job dates and the job will appear on their schedule.")) return;
    setAuthorising(true);
    setError(null);
    while (autoBusy.current) await new Promise((r) => setTimeout(r, 100));
    const err = await persistExisting();
    if (err) {
      setError(err);
      setAuthorising(false);
      return;
    }
    const now = new Date().toISOString();
    const { error: aErr } = await supabase.from("work_orders").update({ authorised_at: now }).eq("id", workOrder.id);
    if (aErr) {
      setError(aErr.message);
      setAuthorising(false);
      return;
    }
    setAuthorisedAt(now);
    const { form: f, lineItems: items } = latest.current;
    const bySub: Record<string, Set<string>> = {};
    for (const l of items) {
      const sid = l.subcontractor_id || f.contractor_id;
      if (!l.task_date || !sid) continue;
      (bySub[sid] ||= new Set()).add(l.task_date);
      notified.current.add(`${sid}|${l.task_date}`);
    }
    const notifyItems = Object.entries(bySub).map(([subcontractor_id, d]) => ({ subcontractor_id, dates: Array.from(d) }));
    setResendNote(null);
    if (notifyItems.length > 0) {
      // Wait for the result so the office hears about a missing or refused email address straight away.
      try {
        const r = await fetch("/api/work-orders/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_order_id: workOrder.id, items: notifyItems }),
        });
        const j = await r.json().catch(() => ({}));
        const problems: string[] = [];
        if (!r.ok) problems.push(j.error || "The email could not be sent.");
        if ((j.noEmail ?? []).length) problems.push(`Not emailed: no email address on file for ${(j.noEmail as string[]).join(", ")}. Add one on the Subcontractors page, then click Re-email contractor.`);
        if ((j.failed ?? []).length) problems.push(`Email refused for ${(j.failed as string[]).join(", ")}. Check the address, then click Re-email contractor.`);
        if (problems.length) setResendNote({ ok: false, text: problems.join(" ") });
        else if (j.sent) setResendNote({ ok: true, text: `Emailed ${(j.to as string[]).join(", ")}.` });
        else setResendNote({ ok: false, text: "Nothing was sent: there are no upcoming dates on this work order." });
      } catch (e: any) {
        setResendNote({ ok: false, text: e?.message || "Couldn't send the email. Click Re-email contractor to try again." });
      }
    }
    logAudit(supabase, {
      eventType: "update",
      entityType: "work_order",
      entityId: workOrder.id,
      entityLabel: f.wo_number.trim(),
      details: "Authorised — contractor emailed",
    });
    setAuthorising(false);
  }

  /** Email the contractor(s) their upcoming job dates again (after authorising). */
  async function resendToContractor() {
    if (!workOrder) return;
    setResending(true);
    setResendNote(null);
    while (autoBusy.current) await new Promise((r) => setTimeout(r, 100));
    const { form: f, lineItems: items } = latest.current;
    const bySub: Record<string, Set<string>> = {};
    for (const l of items) {
      const sid = l.subcontractor_id || f.contractor_id;
      if (!l.task_date || !sid) continue;
      (bySub[sid] ||= new Set()).add(l.task_date);
    }
    const notifyItems = Object.entries(bySub).map(([subcontractor_id, d]) => ({ subcontractor_id, dates: Array.from(d) }));
    if (notifyItems.length === 0) {
      setResendNote({ ok: false, text: "No scheduled dates on this work order to send." });
      setResending(false);
      return;
    }
    try {
      const r = await fetch("/api/work-orders/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_order_id: workOrder.id, items: notifyItems, resend: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setResendNote({ ok: false, text: j.error || "Couldn't send the email." });
      else if (!j.sent) setResendNote({ ok: false, text: (j.noEmail ?? []).length ? `Nothing sent: no email address on file for ${(j.noEmail as string[]).join(", ")}.` : "Nothing sent: there are no upcoming dates on this work order." });
      else setResendNote({ ok: !(j.failed ?? []).length, text: `Emailed ${(j.to as string[]).join(", ")}.${(j.noEmail ?? []).length ? ` No email on file for ${(j.noEmail as string[]).join(", ")}.` : ""}${(j.failed ?? []).length ? ` Refused: ${(j.failed as string[]).join(", ")}.` : ""}` });
    } catch (e: any) {
      setResendNote({ ok: false, text: e?.message || "Couldn't send the email." });
    }
    setResending(false);
  }

  async function saveExisting() {
    setSaving(true);
    setError(null);
    while (autoBusy.current) await new Promise((r) => setTimeout(r, 100));
    const err = await persistExisting();
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    // Alert contractors about job dates that are new since they were last told (fire and forget).
    try {
      const { form: f, lineItems: items } = latest.current;
      const fresh: Record<string, string[]> = {};
      for (const l of items) {
        const sid = l.subcontractor_id || f.contractor_id;
        if (!l.task_date || !sid) continue;
        const k = `${sid}|${l.task_date}`;
        if (notified.current.has(k)) continue;
        notified.current.add(k);
        (fresh[sid] ||= []).push(l.task_date);
      }
      const notifyItems = Object.entries(fresh).map(([subcontractor_id, dates]) => ({ subcontractor_id, dates }));
      if (notifyItems.length > 0) {
        fetch("/api/work-orders/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_order_id: workOrder!.id, items: notifyItems }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
    logAudit(supabase, {
      eventType: "update",
      entityType: "work_order",
      entityId: workOrder!.id,
      entityLabel: latest.current.form.wo_number.trim(),
    });
    router.push(`/dashboard/work-orders/${workOrder!.id}`);
    router.refresh();
  }

  async function save() {
    if (!isNew) return saveExisting();
    if (!form.wo_number.trim()) {
      setError("Please enter a work order number.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      project_id: form.project_id || null,
      contractor_id: form.contractor_id || null,
      wo_number: form.wo_number.trim(),
      po_number: form.po_number || null,
      po_value: Number(form.po_value) || 0,
      entry_date: form.entry_date || null,
      completed_date: form.completed_date || null,
      jsa_received: form.jsa_received,
      notes: form.notes || null,
    };

    let workOrderId: string | undefined;

    if (isNew) {
      const { data, error: insertErr } = await supabase.from("work_orders").insert(payload).select().single();
      if (insertErr || !data) {
        setError(insertErr?.message || "Failed to create work order.");
        setSaving(false);
        return;
      }
      workOrderId = data.id;
    } else {
      const { error: updateErr } = await supabase.from("work_orders").update(payload).eq("id", workOrderId);
      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }
    }

    const rowsToInsert = lineItems.map((l, idx) => ({
      work_order_id: workOrderId,
      part_id: l.part_id || null,
      task_date: l.task_date || null,
      // Only sent when set, so saving still works before migration 0039 is run.
      ...(l.task_time ? { task_time: l.task_time } : {}),
      completed: !!l.completed,
      labour_item_id: l.labour_item_id || null,
      rate: Number(l.rate) || 0,
      qty: Number(l.qty) || 0,
      subcontractor_id: l.subcontractor_id || form.contractor_id || null,
      paid: !!l.paid,
      note: l.note || null,
      sort_order: idx,
    }));

    if (rowsToInsert.length > 0) {
      let { error: linesErr } = await supabase.from("work_order_lines").insert(rowsToInsert);
      // Before migration 0045 is run there is no rate column: save without it (pay then follows the product's rate).
      if (linesErr && /\brate\b/i.test(linesErr.message)) {
        ({ error: linesErr } = await supabase
          .from("work_order_lines")
          .insert(rowsToInsert.map(({ rate: _r, ...rest }) => rest)));
      }
      if (linesErr) {
        setError(linesErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    // Alert contractors about job dates that are new on this save (fire and forget).
    try {
      const before = new Set(lines.filter((l) => l.task_date).map((l) => `${l.subcontractor_id || ""}|${l.task_date}`));
      const fresh: Record<string, string[]> = {};
      for (const r of rowsToInsert) {
        if (!r.task_date || !r.subcontractor_id) continue;
        if (before.has(`${r.subcontractor_id}|${r.task_date}`)) continue;
        (fresh[r.subcontractor_id] ||= []).push(r.task_date);
      }
      const items = Object.entries(fresh).map(([subcontractor_id, dates]) => ({ subcontractor_id, dates }));
      if (items.length > 0) {
        fetch("/api/work-orders/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_order_id: workOrderId, items }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
    logAudit(supabase, {
      eventType: isNew ? "create" : "update",
      entityType: "work_order",
      entityId: workOrderId,
      entityLabel: form.wo_number.trim(),
    });
    router.push(`/dashboard/work-orders/${workOrderId}`);
    router.refresh();
  }

  async function toggleArchive() {
    if (!workOrder) return;
    if (!workOrder.archived && !confirm(`Archive work order ${workOrder.wo_number}?`)) return;
    await supabase.from("work_orders").update({ archived: !workOrder.archived }).eq("id", workOrder.id);
    logAudit(supabase, {
      eventType: workOrder.archived ? "update" : "delete",
      entityType: "work_order",
      entityId: workOrder.id,
      entityLabel: workOrder.wo_number,
      details: workOrder.archived ? "Restored" : "Archived",
    });
    router.push("/dashboard/work-orders");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/work-orders" className="text-sm text-[var(--muted)] hover:underline">
            &larr; Work orders
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {isNew ? "New work order" : `Work order ${workOrder!.wo_number}`}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && isAdmin && (
            <button onClick={toggleArchive} className="text-sm text-[var(--muted)] hover:underline">
              {workOrder!.archived ? "Restore" : "Archive"}
            </button>
          )}
          {!isNew && (
            <Link
              href={`/dashboard/work-orders/${workOrder!.id}/picking-slip`}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Picking slip
            </Link>
          )}
          {!isNew && isAdmin && (
            <Link
              href={`/dashboard/work-orders/${workOrder!.id}/purchase-order`}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Purchase order
            </Link>
          )}
          {!isNew && (
            <Link
              href={`/dashboard/work-orders/${workOrder!.id}/picking-slip/print`}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Print picking slip
            </Link>
          )}
          {!isNew && (
            <Link
              href={`/dashboard/work-orders/${workOrder!.id}/print?download=1`}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
              title="Saves the work order as a PDF you can email to the contractor"
            >
              Download PDF
            </Link>
          )}
          {!isNew && distinctLineContractorIds.length <= 1 && (
            <Link
              href={`/dashboard/work-orders/${workOrder!.id}/print`}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Print preview
            </Link>
          )}
          {!isNew && distinctLineContractorIds.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--muted)]">Print preview (save first):</span>
              {distinctLineContractorIds.map((id) => (
                <Link
                  key={id}
                  href={`/dashboard/work-orders/${workOrder!.id}/print?contractor_id=${id}`}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:border-accent"
                >
                  {subById[id]?.name || "—"}
                </Link>
              ))}
            </div>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : isNew ? "Save work order" : "Save & close"}
          </button>
          {!isNew && authColumn && !authorisedAt && (
            <button
              onClick={authorise}
              disabled={authorising}
              className="rounded-lg bg-[#1f6b35] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              title="Until you authorise, the contractor is not emailed and the job is not on their schedule."
            >
              {authorising ? "Authorising..." : "Authorise & email contractor"}
            </button>
          )}
          {!isNew && authColumn && authorisedAt && (
            <span className="text-xs text-[var(--muted)]">Authorised {new Date(authorisedAt).toLocaleDateString("en-AU")}</span>
          )}
          {!isNew && authColumn && authorisedAt && (
            <button
              onClick={resendToContractor}
              disabled={resending}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-60"
              title="Email the contractor their upcoming job dates again"
            >
              {resending ? "Sending..." : "Re-email contractor"}
            </button>
          )}
          {resendNote && <span className={`text-xs ${resendNote.ok ? "text-green-700" : "text-red-700"}`}>{resendNote.text}</span>}
          {!isNew && (
            <span className={`text-xs ${autoState === "error" ? "text-red-700" : "text-[var(--muted)]"}`}>
              {autoState === "saving" && "Saving…"}
              {autoState === "saved" && "All changes saved"}
              {autoState === "error" && "Auto-save failed"}
              {autoState === "idle" && "Changes save automatically"}
            </span>
          )}
        </div>
      </div>

      {!isNew && progress && <JobProgressStrip workOrderId={workOrder!.id} swms={progress.swms} inspections={progress.inspections} canInspect={canInspect} />}

      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-[var(--border)] p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Job
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
          >
            <option value="">Select job / quote...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                Q{p.quote_number} — {p.customers?.name || "—"} — {p.address}
                {p.suburb ? `, ${p.suburb}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contractor
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.contractor_id}
            onChange={(e) => setContractor(e.target.value)}
          >
            <option value="">Select contractor...</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {selectedContractor && (
            <div className="mt-1 text-xs text-[var(--muted)]">
              {[selectedContractor.phone, selectedContractor.email].filter(Boolean).join(" · ") ||
                "No mobile/email on file for this contractor."}
            </div>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Work order # <span className="text-xs font-normal text-[var(--muted)]">(from the quote)</span>
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.wo_number}
            onChange={(e) => setForm({ ...form, wo_number: e.target.value })}
            placeholder="e.g. QW1001"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          P/O value ($) <span className="text-xs font-normal text-[var(--muted)]">(from the quote)</span>
          <input
            type="number"
            step="0.01"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.po_value}
            onChange={(e) => setForm({ ...form, po_value: Number(e.target.value) })}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Booking date
            <input
              type="date"
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.entry_date}
              onChange={(e) => changeBookingDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Completed date
            <input
              type="date"
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.completed_date}
              onChange={(e) => setForm({ ...form, completed_date: e.target.value })}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.jsa_received}
            onChange={(e) => setForm({ ...form, jsa_received: e.target.checked })}
          />
          JSA received (paper/other, kept as a fallback)
        </label>

        {!isNew && workOrder && (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Link
              href={`/dashboard/swms/new?work_order_id=${workOrder.id}${canInspect ? "" : "&start=1"}`}
              className="inline-block rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)]"
            >
              + Start a digital SWMS / JSA for this work order
            </Link>
            {canInspect && (
              <Link
                href={`/dashboard/inspections/new?work_order_id=${workOrder.id}`}
                className="inline-block rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:border-[var(--brand-gold-dark)]"
              >
                + New inspection report
              </Link>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Work order notes
          <textarea
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Task lines</h2>
            <p className="text-xs text-[var(--muted)]">
              Dates follow the Booking date; change a line's date if it is on a different day. Need more than one contractor on the same product? Use "Duplicate" on that line, split the m²
              between the copies, and set each one's Contractor.
            </p>
          </div>
          <button onClick={addLine} className="text-sm text-accent hover:underline">
            + Add task
          </button>
        </div>

        {(() => {
          const COLS =
            "lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1.6fr)_8.5rem_5.5rem_5rem_6rem_3.5rem_3.5rem_9rem]";
          const inp = "w-full min-w-0 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs";
          const lab = "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] lg:hidden";
          return (
            <div className="mt-3 rounded-xl border border-[var(--border)]">
              <div
                className={`hidden gap-2 rounded-t-xl bg-[#f2f0ec] px-3 py-2 text-center text-[11px] font-semibold uppercase text-[var(--muted)] lg:grid ${COLS}`}
              >
                <span className="text-center">Product</span>
                <span className="text-center">Contractor</span>
                <span className="text-center">Date</span>
                <span className="text-center">Time</span>
                <span className="text-center">m²</span>
                <span className="text-center">Contractor $</span>
                <span className="text-center">Done</span>
                <span className="text-center">Paid</span>
                <span />
              </div>
              {lineItems.map((l, idx) => {
                return (
                  <div key={idx} className="border-t border-[var(--border)] px-3 py-2 first:border-t-0 lg:first:border-t">
                    <div className={`grid grid-cols-2 items-end gap-2 sm:grid-cols-4 lg:items-center ${COLS}`}>
                      <div className="col-span-2 sm:col-span-4 lg:col-span-1">
                        <span className={lab}>Product</span>
                        <PartPicker
                          parts={selectableParts}
                          value={l.part_id || null}
                          onChange={(id) =>
                            updateLine(idx, {
                              part_id: id,
                              rate: id ? partById[id]?.installer_rate_per_m2 ?? 0 : 0,
                              labour_item_id: null,
                            })
                          }
                        />
                      </div>
                      <label className="col-span-2 sm:col-span-2 lg:col-span-1">
                        <span className={lab}>Contractor</span>
                        <select
                          className={inp}
                          value={l.subcontractor_id || ""}
                          onChange={(e) => updateLine(idx, { subcontractor_id: e.target.value || null })}
                        >
                          <option value="">(use WO contractor)</option>
                          {subs.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={lab}>Date</span>
                        <input
                          type="date"
                          className={inp}
                          value={l.task_date || ""}
                          onChange={(e) => updateLine(idx, { task_date: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={lab}>Time</span>
                        <input
                          type="time"
                          className={inp}
                          value={(l.task_time || "").slice(0, 5)}
                          onChange={(e) => updateLine(idx, { task_time: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className={lab}>m²</span>
                        <input
                          type="number"
                          step="0.01"
                          className={inp + " text-center"}
                          value={l.qty}
                          onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                        />
                        {l.part_id && woLinePacks(l.qty, partById[l.part_id]) !== null && (
                          <span className="mt-0.5 block text-center text-[11px] text-[var(--muted)]">
                            {woLinePacks(l.qty, partById[l.part_id])} packs
                          </span>
                        )}
                      </label>
                      <div className="text-center text-sm font-medium">
                        <span className={lab}>Contractor $</span>
                        {fmtCurrency((Number(l.qty) || 0) * (Number(l.rate) || 0))}
                      </div>
                      <label className="flex items-center justify-center gap-1 text-xs lg:justify-center">
                        <span className="lg:hidden">Done</span>
                        <input
                          type="checkbox"
                          checked={!!l.completed}
                          onChange={(e) => updateLine(idx, { completed: e.target.checked })}
                        />
                      </label>
                      <label className="flex items-center justify-center gap-1 text-xs lg:justify-center">
                        <span className="lg:hidden">Paid</span>
                        <input
                          type="checkbox"
                          checked={!!l.paid}
                          onChange={(e) => updateLine(idx, { paid: e.target.checked })}
                        />
                      </label>
                      <div className="flex items-center justify-end gap-3 text-xs whitespace-nowrap">
                        <button
                          onClick={() => duplicateLine(idx)}
                          className="text-accent hover:underline"
                          title="Duplicate this line to split it across another contractor"
                        >
                          Duplicate
                        </button>
                        <button onClick={() => removeLine(idx)} className="text-[var(--muted)] hover:underline">
                          Remove
                        </button>
                      </div>
                    </div>
                    <input
                      className="mt-1.5 w-full rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                      value={l.note || ""}
                      onChange={(e) => updateLine(idx, { note: e.target.value })}
                      placeholder="Note: site instructions, access, etc."
                    />
                  </div>
                );
              })}
              {lineItems.length === 0 && (
                <div className="px-4 py-8 text-center text-[var(--muted)]">No task lines yet.</div>
              )}
            </div>
          );
        })()}

        <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[#f2f0ec] p-3 text-sm">
          <span className="text-[var(--muted)]">
            {lineItems.length} task(s), {lineItems.filter((l) => l.completed).length} completed,{" "}
            {lineItems.filter((l) => l.paid).length} paid
          </span>
          <span className="font-semibold">Contractor total {fmtCurrency(contractorCost)}</span>
        </div>
      </div>
    </div>
  );
}
