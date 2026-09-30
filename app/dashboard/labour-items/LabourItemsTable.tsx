"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LabourItem = {
  id: string;
  code: string;
  description: string;
  contractor_rate: number;
  archived: boolean;
};

type Align = "left" | "right" | "center";

const JUSTIFY: Record<Align, string> = {
  left: "justify-start",
  right: "justify-end",
  center: "justify-center",
};
const TEXT_ALIGN: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function InlineCell({
  value,
  onCommit,
  type = "text",
  align = "left",
  prefix,
}: {
  value: string | number;
  onCommit: (v: string | number) => void;
  type?: "text" | "number";
  align?: Align;
  prefix?: string;
}) {
  const [v, setV] = useState(String(value));

  useEffect(() => {
    setV(String(value));
  }, [value]);

  // When there's a $ prefix, the input sizes to its content instead of stretching to
  // fill the cell — otherwise the prefix and the number end up far apart.
  const inputWidthClass = prefix ? "w-16 shrink-0" : "min-w-0 flex-1";

  return (
    <div className={`min-w-0 flex-1 flex items-center gap-1 ${JUSTIFY[align]}`}>
      {prefix && <span className="shrink-0 text-[var(--muted)]">{prefix}</span>}
      <input
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const parsed = type === "number" ? Number(v) || 0 : v;
          if (parsed !== value) onCommit(parsed);
        }}
        className={`${inputWidthClass} rounded border border-transparent bg-transparent px-1 py-1 text-sm hover:border-[var(--border)] focus:border-accent focus:bg-white focus:outline-none ${TEXT_ALIGN[align]}`}
      />
    </div>
  );
}

const emptyForm = { code: "", description: "", contractor_rate: 0 };

export default function LabourItemsTable({ initial }: { initial: LabourItem[] }) {
  const supabase = createClient();
  const [items, setItems] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setForm(emptyForm);
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    const { data, error } = await supabase.from("labour_items").insert(form).select().single();
    if (!error && data) {
      setItems((prev) => [data as LabourItem, ...prev]);
      setModalOpen(false);
    } else if (error) alert(error.message);
    setSaving(false);
  }

  async function updateField(i: LabourItem, patch: Partial<LabourItem>) {
    // Update the row on screen immediately so the input doesn't feel laggy.
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("labour_items").update(patch).eq("id", i.id);
    if (error) {
      alert(error.message);
      setItems((prev) => prev.map((x) => (x.id === i.id ? i : x)));
    }
  }

  async function toggleArchive(i: LabourItem) {
    if (!i.archived && !confirm(`Archive "${i.description}"?`)) return;
    const { data, error } = await supabase
      .from("labour_items")
      .update({ archived: !i.archived })
      .eq("id", i.id)
      .select()
      .single();
    if (!error && data) {
      setItems((prev) => prev.map((x) => (x.id === i.id ? (data as LabourItem) : x)));
    }
  }

  const visible = items.filter((i) => i.archived === showArchived);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Labour Items</h1>
        <button onClick={openNew} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Add labour item
        </button>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Contractor pay rate schedule — used to price and pay contractors, separate from customer
        quoting. Click any cell below to edit it directly.
      </p>

      <button
        onClick={() => setShowArchived((v) => !v)}
        className="mt-4 text-sm text-[var(--muted)] underline"
      >
        {showArchived ? "View active" : "View archived"}
      </button>

      <div className="mt-4 max-w-2xl overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-20" />
            <col />
            <col className="w-32" />
            <col className="w-24" />
          </colgroup>
          <thead className="text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-center">Contractor rate</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id} className="border-t border-[var(--border)]">
                <td className="px-1 py-1 font-mono text-xs">
                  <InlineCell value={i.code} onCommit={(v) => updateField(i, { code: String(v) })} />
                </td>
                <td className="px-1 py-1">
                  <InlineCell
                    value={i.description}
                    onCommit={(v) => updateField(i, { description: String(v) })}
                  />
                </td>
                <td className="px-1 py-1">
                  <InlineCell
                    value={i.contractor_rate}
                    type="number"
                    align="center"
                    prefix="$"
                    onCommit={(v) => updateField(i, { contractor_rate: Number(v) })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => toggleArchive(i)} className="text-[var(--muted)] hover:underline">
                    {i.archived ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                  No labour items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-6 py-4">
              <h2 className="text-lg font-bold">Add labour item</h2>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <label className="flex flex-col gap-1 text-sm">
                Code
                <input
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Description
                <input
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Contractor rate ($ per unit)
                <input
                  type="number"
                  step="0.01"
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.contractor_rate}
                  onChange={(e) => setForm({ ...form, contractor_rate: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
              <button onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !form.code || !form.description}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
