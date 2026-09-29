"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LabourItem = {
  id: string;
  code: string;
  description: string;
  contractor_rate: number;
  archived: boolean;
};

const emptyForm = { code: "", description: "", contractor_rate: 0 };

export default function LabourItemsTable({ initial }: { initial: LabourItem[] }) {
  const supabase = createClient();
  const [items, setItems] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<LabourItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(i: LabourItem) {
    setEditing(i);
    setForm({ code: i.code, description: i.description, contractor_rate: i.contractor_rate });
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    if (editing) {
      const { data, error } = await supabase
        .from("labour_items")
        .update(form)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setItems((prev) => prev.map((i) => (i.id === editing.id ? (data as LabourItem) : i)));
        setModalOpen(false);
      } else if (error) alert(error.message);
    } else {
      const { data, error } = await supabase.from("labour_items").insert(form).select().single();
      if (!error && data) {
        setItems((prev) => [data as LabourItem, ...prev]);
        setModalOpen(false);
      } else if (error) alert(error.message);
    }
    setSaving(false);
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
        quoting.
      </p>

      <button
        onClick={() => setShowArchived((v) => !v)}
        className="mt-4 text-sm text-[var(--muted)] underline"
      >
        {showArchived ? "View active" : "View archived"}
      </button>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Contractor rate</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">{i.code}</td>
                <td className="px-4 py-2">{i.description}</td>
                <td className="px-4 py-2">${i.contractor_rate.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(i)} className="text-accent hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => toggleArchive(i)}
                    className="ml-3 text-[var(--muted)] hover:underline"
                  >
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
              <h2 className="text-lg font-bold">{editing ? "Edit labour item" : "Add labour item"}</h2>
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
