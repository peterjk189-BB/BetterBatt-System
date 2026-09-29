"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Subcontractor = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  abn: string | null;
  active: boolean;
  archived: boolean;
};

const emptyForm = { name: "", phone: "", email: "", abn: "", active: true };

export default function SubcontractorsTable({ initial }: { initial: Subcontractor[] }) {
  const supabase = createClient();
  const [subs, setSubs] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(s: Subcontractor) {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone || "",
      email: s.email || "",
      abn: s.abn || "",
      active: s.active,
    });
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    if (editing) {
      const { data, error } = await supabase
        .from("subcontractors")
        .update(form)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setSubs((prev) => prev.map((s) => (s.id === editing.id ? (data as Subcontractor) : s)));
        setModalOpen(false);
      } else if (error) alert(error.message);
    } else {
      const { data, error } = await supabase.from("subcontractors").insert(form).select().single();
      if (!error && data) {
        setSubs((prev) => [data as Subcontractor, ...prev]);
        setModalOpen(false);
      } else if (error) alert(error.message);
    }
    setSaving(false);
  }

  async function toggleArchive(s: Subcontractor) {
    if (!s.archived && !confirm(`Archive ${s.name}?`)) return;
    const { data, error } = await supabase
      .from("subcontractors")
      .update({ archived: !s.archived })
      .eq("id", s.id)
      .select()
      .single();
    if (!error && data) {
      setSubs((prev) => prev.map((x) => (x.id === s.id ? (data as Subcontractor) : x)));
    }
  }

  const visible = subs.filter((s) => s.archived === showArchived);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Subcontractors</h1>
        <button onClick={openNew} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Add subcontractor
        </button>
      </div>

      <button onClick={() => setShowArchived((v) => !v)} className="mt-4 text-sm text-[var(--muted)] underline">
        {showArchived ? "View active" : "View archived"}
      </button>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">ABN</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2">{s.phone || "—"}</td>
                <td className="px-4 py-2">{s.email || "—"}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{s.abn || "—"}</td>
                <td className="px-4 py-2">
                  {s.active ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Active</span>
                  ) : (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(s)} className="text-accent hover:underline">
                    Edit
                  </button>
                  <button onClick={() => toggleArchive(s)} className="ml-3 text-[var(--muted)] hover:underline">
                    {s.archived ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No subcontractors found.
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
              <h2 className="text-lg font-bold">{editing ? "Edit subcontractor" : "Add subcontractor"}</h2>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <label className="flex flex-col gap-1 text-sm">
                Name / company
                <input
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  Mobile
                  <input
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Email
                  <input
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                ABN
                <input
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.abn}
                  onChange={(e) => setForm({ ...form, abn: e.target.value })}
                  placeholder="Leave blank if paid as an individual"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
              <button onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name}
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
