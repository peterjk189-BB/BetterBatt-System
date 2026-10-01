"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
type Part = { id: string; name: string };

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
};

type Line = {
  id?: string;
  part_id: string | null;
  task_date?: string | null;
  completed?: boolean;
  labour_item_id?: string | null;
  qty: number;
  subcontractor_id?: string | null;
  paid?: boolean;
  note?: string | null;
  sort_order?: number;
};

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
}: {
  workOrder: WorkOrder | null;
  lines: Line[];
  prefillHeader: { project_id: string; wo_number: string; po_value: number } | null;
  projects: Project[];
  subs: Sub[];
  labourItems: LabourItem[];
  parts: Part[];
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
    notes: workOrder?.notes || "",
  });

  const isDeliveryItem = (name: string | undefined) => /delivery/i.test(name || "");

  const [lineItems, setLineItems] = useState<Line[]>(
    lines.length > 0
      ? lines
          .filter((l) => !isDeliveryItem(l.part_id ? partById[l.part_id]?.name : undefined))
          .map((l) => ({ ...l, completed: l.completed ?? false, paid: l.paid ?? false }))
      : []
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    setLineItems((prev) => [
      ...prev,
      {
        part_id: null,
        task_date: "",
        completed: false,
        labour_item_id: labourItems[0]?.id || null,
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
    setLineItems((prev) => prev.map((l) => ({ ...l, subcontractor_id: contractorId || null })));
  }

  const selectedContractor = form.contractor_id ? subById[form.contractor_id] : undefined;

  const contractorCost = lineItems.reduce((s, l) => {
    const rate = l.labour_item_id ? labourItemById[l.labour_item_id]?.contractor_rate || 0 : 0;
    return s + (Number(l.qty) || 0) * rate;
  }, 0);

  async function save() {
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

    let workOrderId = workOrder?.id;

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
      await supabase.from("work_order_lines").delete().eq("work_order_id", workOrderId);
    }

    const rowsToInsert = lineItems.map((l, idx) => ({
      work_order_id: workOrderId,
      part_id: l.part_id || null,
      task_date: l.task_date || null,
      completed: !!l.completed,
      labour_item_id: l.labour_item_id || null,
      qty: Number(l.qty) || 0,
      subcontractor_id: form.contractor_id || null,
      paid: !!l.paid,
      note: l.note || null,
      sort_order: idx,
    }));

    if (rowsToInsert.length > 0) {
      const { error: linesErr } = await supabase.from("work_order_lines").insert(rowsToInsert);
      if (linesErr) {
        setError(linesErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push(`/dashboard/work-orders/${workOrderId}`);
    router.refresh();
  }

  async function toggleArchive() {
    if (!workOrder) return;
    if (!workOrder.archived && !confirm(`Archive work order ${workOrder.wo_number}?`)) return;
    await supabase.from("work_orders").update({ archived: !workOrder.archived }).eq("id", workOrder.id);
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
          {!isNew && (
            <button onClick={toggleArchive} className="text-sm text-[var(--muted)] hover:underline">
              {workOrder!.archived ? "Restore" : "Archive"}
            </button>
          )}
          {!isNew && (
            <Link
              href={`/dashboard/work-orders/${workOrder!.id}/print`}
              target="_blank"
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Print preview
            </Link>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save work order"}
          </button>
        </div>
      </div>

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
          P/O number
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.po_number}
            onChange={(e) => setForm({ ...form, po_number: e.target.value })}
            placeholder="e.g. VERH1750/390"
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
            Entry date
            <input
              type="date"
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.entry_date}
              onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
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
          JSA received
        </label>

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
          <h2 className="text-lg font-bold">Task lines</h2>
          <button onClick={addLine} className="text-sm text-accent hover:underline">
            + Add task
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Compl.</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2 text-right">Contractor $</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((l, idx) => {
                const rate = l.labour_item_id ? labourItemById[l.labour_item_id]?.contractor_rate || 0 : 0;
                const cost = (Number(l.qty) || 0) * rate;
                return (
                  <tr key={idx} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-xs text-[var(--muted)]">
                      {l.part_id ? partById[l.part_id]?.name || "—" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        className="w-36 rounded-lg border border-[var(--border)] px-2 py-1.5"
                        value={l.task_date || ""}
                        onChange={(e) => updateLine(idx, { task_date: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!l.completed}
                        onChange={(e) => updateLine(idx, { completed: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-lg border border-[var(--border)] px-2 py-1.5"
                        value={l.labour_item_id || ""}
                        onChange={(e) => updateLine(idx, { labour_item_id: e.target.value })}
                      >
                        <option value="">Select task...</option>
                        {labourItems.map((li) => (
                          <option key={li.id} value={li.id}>
                            {li.code} — {li.description}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        className="w-20 rounded-lg border border-[var(--border)] px-2 py-1.5 text-right"
                        value={l.qty}
                        onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!l.paid}
                        onChange={(e) => updateLine(idx, { paid: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{fmtCurrency(cost)}</td>
                    <td className="px-3 py-2">
                      <input
                        className="w-40 rounded-lg border border-[var(--border)] px-2 py-1.5"
                        value={l.note || ""}
                        onChange={(e) => updateLine(idx, { note: e.target.value })}
                        placeholder="Site instructions, access, etc."
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeLine(idx)} className="text-[var(--muted)] hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--muted)]">
                    No task lines yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
