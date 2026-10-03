"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

type Customer = {
  id: string;
  name: string;
  category: "Builder" | "Retro Fit" | "Private";
  discount_pct: number;
  payment_terms: "7 Days" | "COD" | "30 Days";
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  archived: boolean;
};

const CATEGORY_COLORS: Record<string, string> = {
  Builder: "bg-blue-100 text-blue-800",
  "Retro Fit": "bg-green-100 text-green-800",
  Private: "bg-yellow-100 text-yellow-800",
};

const emptyForm = {
  name: "",
  category: "Private" as Customer["category"],
  discount_pct: 0,
  payment_terms: "7 Days" as Customer["payment_terms"],
  contact_name: "",
  contact_phone: "",
  contact_email: "",
};

export default function CustomersTable({ initial, isAdmin }: { initial: Customer[]; isAdmin: boolean }) {
  const supabase = createClient();
  const [customers, setCustomers] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      category: c.category,
      discount_pct: c.discount_pct,
      payment_terms: c.payment_terms,
      contact_name: c.contact_name || "",
      contact_phone: c.contact_phone || "",
      contact_email: c.contact_email || "",
    });
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    if (editing) {
      const { data, error } = await supabase
        .from("customers")
        .update(form)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setCustomers((prev) => prev.map((c) => (c.id === editing.id ? (data as Customer) : c)));
        setModalOpen(false);
        logAudit(supabase, { eventType: "update", entityType: "customer", entityId: data.id, entityLabel: data.name });
      } else if (error) {
        alert(error.message);
      }
    } else {
      const { data, error } = await supabase.from("customers").insert(form).select().single();
      if (!error && data) {
        setCustomers((prev) => [data as Customer, ...prev]);
        setModalOpen(false);
        logAudit(supabase, { eventType: "create", entityType: "customer", entityId: data.id, entityLabel: data.name });
      } else if (error) {
        alert(error.message);
      }
    }
    setSaving(false);
  }

  async function toggleArchive(c: Customer) {
    if (!c.archived && !confirm(`Archive ${c.name}? This hides them from normal views but can be restored.`)) {
      return;
    }
    const { data, error } = await supabase
      .from("customers")
      .update({ archived: !c.archived })
      .eq("id", c.id)
      .select()
      .single();
    if (!error && data) {
      setCustomers((prev) => prev.map((x) => (x.id === c.id ? (data as Customer) : x)));
      logAudit(supabase, {
        eventType: c.archived ? "update" : "delete",
        entityType: "customer",
        entityId: c.id,
        entityLabel: c.name,
        details: c.archived ? "Restored" : "Archived",
      });
    }
  }

  const visible = customers
    .filter((c) => c.archived === showArchived)
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button onClick={openNew} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Add customer
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="text-sm text-[var(--muted)] underline"
        >
          {showArchived ? "View active" : "View archived"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Terms</th>
              <th className="px-4 py-2">Discount</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${CATEGORY_COLORS[c.category]}`}>
                    {c.category}
                  </span>
                </td>
                <td className="px-4 py-2">{c.payment_terms}</td>
                <td className="px-4 py-2">{c.discount_pct}%</td>
                <td className="px-4 py-2 text-[var(--muted)]">
                  {[c.contact_name, c.contact_phone].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-2 text-[var(--muted)]">{c.contact_email || "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(c)} className="text-accent hover:underline">
                    Edit
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => toggleArchive(c)}
                      className="ml-3 text-[var(--muted)] hover:underline"
                    >
                      {c.archived ? "Restore" : "Archive"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                  No {showArchived ? "archived" : ""} customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-6 py-4">
              <h2 className="text-lg font-bold">{editing ? "Edit customer" : "Add customer"}</h2>
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
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  Category
                  <select
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as Customer["category"] })}
                  >
                    <option>Builder</option>
                    <option>Retro Fit</option>
                    <option>Private</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Payment terms
                  <select
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.payment_terms}
                    onChange={(e) =>
                      setForm({ ...form, payment_terms: e.target.value as Customer["payment_terms"] })
                    }
                  >
                    <option>7 Days</option>
                    <option>COD</option>
                    <option>30 Days</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                Standing discount %
                <input
                  type="number"
                  step="0.1"
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.discount_pct}
                  onChange={(e) => setForm({ ...form, discount_pct: Number(e.target.value) })}
                />
              </label>
              <p className="text-xs text-[var(--muted)]">
                Contact details are usually captured per quote instead of here — only fill these in if
                this customer has a standing contact.
              </p>
              <label className="flex flex-col gap-1 text-sm">
                Contact name
                <input
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  Phone
                  <input
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Email
                  <input
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  />
                </label>
              </div>
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
