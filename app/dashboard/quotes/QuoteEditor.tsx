"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Customer = {
  id: string;
  name: string;
  category: "Builder" | "Retro Fit" | "Private";
  discount_pct: number;
};

type Part = {
  id: string;
  name: string;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  installer_rate_per_m2: number;
  supply_charge_per_pack: number;
  supply_install_rate_per_m2: number;
  is_stock_item: boolean;
};

type Project = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  job_type: string;
  category: string | null;
  outcome: "Open" | "Accepted" | "Lost" | "Cancelled";
  lot_no: string | null;
  address: string | null;
  suburb: string | null;
  entry_date: string;
  notes: string | null;
  quote_markup: number;
  archived: boolean;
};

type Line = {
  id?: string;
  part_id: string | null;
  qty_m2: number;
  note: string | null;
  sort_order: number;
};

const JOB_TYPES = ["S+F QUOTE", "SUPPLY & INSTALL", "SUPPLY ONLY", "MATERIAL QUOTE", "OPTION QUOTE"];
const CATEGORIES = ["Builder", "Retro Fit", "Private"];
const OUTCOMES = ["Open", "Accepted", "Lost", "Cancelled"];

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function computeLine(part: Part | undefined, qty: number) {
  if (!part) {
    return { packs: 0, usedForCal: 0, materialCost: 0, labourCost: 0, supplyOnlyCharge: 0, supplyInstallCharge: 0 };
  }
  const q = Number(qty) || 0;
  const packs = part.coverage_m2 > 0 ? Math.ceil(q / part.coverage_m2) : 0;
  const usedForCal = packs * part.coverage_m2;
  return {
    packs,
    usedForCal,
    materialCost: packs * part.pack_cost_ex_gst,
    labourCost: q * part.installer_rate_per_m2,
    supplyOnlyCharge: packs * part.supply_charge_per_pack,
    supplyInstallCharge: usedForCal * part.supply_install_rate_per_m2,
  };
}

export default function QuoteEditor({
  project,
  lines,
  customers,
  parts,
}: {
  project: Project | null;
  lines: Line[];
  customers: Customer[];
  parts: Part[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);
  const isNew = !project;

  const [form, setForm] = useState({
    customer_id: project?.customer_id || "",
    contact_name: project?.contact_name || "",
    contact_phone: project?.contact_phone || "",
    contact_email: project?.contact_email || "",
    job_type: project?.job_type || "SUPPLY & INSTALL",
    category: project?.category || "",
    outcome: project?.outcome || "Open",
    lot_no: project?.lot_no || "",
    address: project?.address || "",
    suburb: project?.suburb || "",
    entry_date: project?.entry_date || new Date().toISOString().slice(0, 10),
    notes: project?.notes || "",
    quote_markup: project?.quote_markup ?? 0,
  });

  const [lineItems, setLineItems] = useState<Line[]>(
    lines.length > 0
      ? lines.map((l) => ({ ...l }))
      : [{ part_id: "", qty_m2: 0, note: "", sort_order: 0 }]
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setCustomer(customerId: string) {
    const c = customers.find((x) => x.id === customerId);
    setForm((f) => ({ ...f, customer_id: customerId, category: c?.category || f.category }));
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLineItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLineItems((prev) => [...prev, { part_id: "", qty_m2: 0, note: "", sort_order: prev.length }]);
  }

  function removeLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const isSupplyOnly = form.job_type === "SUPPLY ONLY";

  const computedLines = lineItems.map((l) => ({ ...l, ...computeLine(partById[l.part_id || ""], l.qty_m2) }));
  const materialCost = computedLines.reduce((s, l) => s + l.materialCost, 0);
  const labourCost = isSupplyOnly ? 0 : computedLines.reduce((s, l) => s + l.labourCost, 0);
  const chargeBeforeMarkup = computedLines.reduce(
    (s, l) => s + (isSupplyOnly ? l.supplyOnlyCharge : l.supplyInstallCharge),
    0
  );
  const subtotal = chargeBeforeMarkup + Number(form.quote_markup || 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;
  const profit = subtotal - materialCost - labourCost;
  const marginPct = subtotal ? (profit / subtotal) * 100 : 0;

  async function save() {
    if (!form.customer_id) {
      setError("Please select a customer.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      customer_id: form.customer_id,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      job_type: form.job_type,
      category: form.category || null,
      outcome: form.outcome,
      lot_no: form.lot_no || null,
      address: form.address || null,
      suburb: form.suburb || null,
      entry_date: form.entry_date,
      notes: form.notes || null,
      quote_markup: Number(form.quote_markup) || 0,
    };

    let projectId = project?.id;

    if (isNew) {
      const { data, error: insertErr } = await supabase.from("projects").insert(payload).select().single();
      if (insertErr || !data) {
        setError(insertErr?.message || "Failed to create quote.");
        setSaving(false);
        return;
      }
      projectId = data.id;
    } else {
      const { error: updateErr } = await supabase.from("projects").update(payload).eq("id", projectId);
      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }
      // Clear existing lines, then re-insert the current set (simplest way to keep this in sync).
      await supabase.from("project_lines").delete().eq("project_id", projectId);
    }

    const rowsToInsert = lineItems
      .filter((l) => l.part_id)
      .map((l, idx) => ({
        project_id: projectId,
        part_id: l.part_id,
        qty_m2: Number(l.qty_m2) || 0,
        note: l.note || null,
        sort_order: idx,
      }));

    if (rowsToInsert.length > 0) {
      const { error: linesErr } = await supabase.from("project_lines").insert(rowsToInsert);
      if (linesErr) {
        setError(linesErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push(`/dashboard/quotes/${projectId}`);
    router.refresh();
  }

  async function toggleArchive() {
    if (!project) return;
    if (!project.archived && !confirm(`Archive quote Q${project.quote_number}?`)) return;
    await supabase.from("projects").update({ archived: !project.archived }).eq("id", project.id);
    router.push("/dashboard/quotes");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/quotes" className="text-sm text-[var(--muted)] hover:underline">
            &larr; Quotes
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {isNew ? "New quote" : `Quote Q${project!.quote_number}`}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && (
            <button onClick={toggleArchive} className="text-sm text-[var(--muted)] hover:underline">
              {project!.archived ? "Restore" : "Archive"}
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save quote"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Header fields */}
      <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-[var(--border)] p-5 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Customer
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.customer_id}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="">Select customer...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Job type
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.job_type}
            onChange={(e) => setForm({ ...form, job_type: e.target.value })}
          >
            {JOB_TYPES.map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Outcome
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.outcome}
            onChange={(e) => setForm({ ...form, outcome: e.target.value as Project["outcome"] })}
          >
            {OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
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
          Lot no.
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.lot_no}
            onChange={(e) => setForm({ ...form, lot_no: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Address
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Suburb
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.suburb}
            onChange={(e) => setForm({ ...form, suburb: e.target.value })}
          />
        </label>

        <p className="text-xs font-medium uppercase text-[var(--muted)] sm:col-span-3">
          Contact for this quote (not the customer's standing contact)
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Contact name
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contact phone
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contact email
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-3">
          Notes
          <textarea
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
      </div>

      {/* Line items */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Line items</h2>
          <button onClick={addLine} className="text-sm text-accent hover:underline">
            + Add line
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Qty (m²)</th>
                <th className="px-3 py-2">Packs</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2 text-right">Charge</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {computedLines.map((l, idx) => (
                <tr key={idx} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <select
                      className="rounded-lg border border-[var(--border)] px-2 py-1.5"
                      value={l.part_id || ""}
                      onChange={(e) => updateLine(idx, { part_id: e.target.value })}
                    >
                      <option value="">Select product...</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 rounded-lg border border-[var(--border)] px-2 py-1.5"
                      value={l.qty_m2}
                      onChange={(e) => updateLine(idx, { qty_m2: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--muted)]">{l.packs}</td>
                  <td className="px-3 py-2">
                    <input
                      className="w-40 rounded-lg border border-[var(--border)] px-2 py-1.5"
                      value={l.note || ""}
                      onChange={(e) => updateLine(idx, { note: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {fmtCurrency(isSupplyOnly ? l.supplyOnlyCharge : l.supplyInstallCharge)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => removeLine(idx)} className="text-[var(--muted)] hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="mt-6 grid grid-cols-2 gap-6 rounded-xl border border-[var(--border)] p-5 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          Quote markup ($, can be negative)
          <input
            type="number"
            step="0.01"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.quote_markup}
            onChange={(e) => setForm({ ...form, quote_markup: Number(e.target.value) })}
          />
        </label>
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Subtotal</div>
          <div className="text-lg font-semibold">{fmtCurrency(subtotal)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">GST (10%)</div>
          <div className="text-lg font-semibold">{fmtCurrency(gst)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Total payable</div>
          <div className="text-lg font-bold text-accent">{fmtCurrency(total)}</div>
        </div>

        <div className="col-span-2 border-t border-[var(--border)] pt-4 sm:col-span-4">
          <p className="mb-2 text-xs font-medium uppercase text-[var(--muted)]">
            Internal only — not shown to the customer
          </p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Material cost</div>
              <div className="font-medium">{fmtCurrency(materialCost)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Labour cost</div>
              <div className="font-medium">{fmtCurrency(labourCost)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Profit</div>
              <div className="font-medium">{fmtCurrency(profit)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Margin</div>
              <div className="font-medium">{marginPct.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
