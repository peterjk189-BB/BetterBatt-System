"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  archived: boolean;
};

const emptyForm = { name: "", phone: "", email: "", notes: "" };

export default function SuppliersTable({ initial }: { initial: Supplier[] }) {
  const supabase = createClient();
  const [suppliers, setSuppliers] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone || "", email: s.email || "", notes: s.notes || "" });
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    if (editing) {
      const { data, error } = await supabase
        .from("suppliers")
        .update(form)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setSuppliers((prev) => prev.map((s) => (s.id === editing.id ? (data as Supplier) : s)));
        setModalOpen(false);
        logAudit(supabase, { eventType: "update", entityType: "supplier", entityId: data.id, entityLabel: data.name });
      } else if (error) alert(error.message);
    } else {
      const { data, error } = await supabase.from("suppliers").insert(form).select().single();
      if (!error && data) {
        setSuppliers((prev) => [data as Supplier, ...prev]);
        setModalOpen(false);
        logAudit(supabase, { eventType: "create", entityType: "supplier", entityId: data.id, entityLabel: data.name });
      } else if (error) alert(error.message);
    }
    setSaving(false);
  }

  async function toggleArchive(s: Supplier) {
    if (!s.archived && !confirm(`Archive ${s.name}?`)) return;
    const { data, error } = await supabase
      .from("suppliers")
      .update({ archived: !s.archived })
      .eq("id", s.id)
      .select()
      .single();
    if (!error && data) {
      setSuppliers((prev) => prev.map((x) => (x.id === s.id ? (data as Supplier) : x)));
      logAudit(supabase, {
        eventType: s.archived ? "update" : "delete",
        entityType: "supplier",
        entityId: s.id,
        entityLabel: s.name,
        details: s.archived ? "Restored" : "Archived",
      });
    }
  }

  const visible = suppliers.filter((s) => s.archived === showArchived);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <button onClick={openNew} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Add supplier
        </button>
      </div>

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
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2">{s.phone || "—"}</td>
                <td className="px-4 py-2">{s.email || "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(s)} className="text-accent hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => toggleArchive(s)}
                    className="ml-3 text-[var(--muted)] hover:underline"
                  >
                    {s.archived ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                  No suppliers found.
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
              <h2 className="text-lg font-bold">{editing ? "Edit supplier" : "Add supplier"}</h2>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <label className="flex flex-col gap-1 text-sm">
                Name
                <input
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Phone
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
              <label className="flex flex-col gap-1 text-sm">
                Notes
                <textarea
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
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
