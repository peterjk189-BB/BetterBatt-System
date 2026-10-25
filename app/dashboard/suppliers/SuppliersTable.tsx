"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address?: string | null;
  notes: string | null;
  archived: boolean;
  // Added by migration 0043 — absent until it's been run.
  accounts_contact_name?: string | null;
  accounts_contact_email?: string | null;
  accounts_contact_phone?: string | null;
  rep_name?: string | null;
  rep_phone?: string | null;
  rep_email?: string | null;
  po_email?: string | null;
  po_cc_email?: string | null;
  po_bulk_email?: boolean | null;
  // Added by migration 0044.
  email_contacts?: EmailContact[] | null;
};

type EmailContact = { label: string; email: string; po: boolean };

/** The extra email addresses for a supplier. Falls back to the single PO email / accounts copy saved before the list existed. */
function contactsOf(s: Supplier): EmailContact[] {
  if (Array.isArray(s.email_contacts) && s.email_contacts.length > 0) {
    return s.email_contacts.map((c) => ({ label: c?.label || "", email: c?.email || "", po: !!c?.po }));
  }
  const out: EmailContact[] = [];
  if (s.po_email) out.push({ label: "Orders", email: s.po_email, po: true });
  if (s.po_cc_email) out.push({ label: "Accounts (copy)", email: s.po_cc_email, po: true });
  return out;
}

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  accounts_contact_name: "",
  accounts_contact_email: "",
  accounts_contact_phone: "",
  rep_name: "",
  rep_phone: "",
  rep_email: "",
  email_contacts: [] as EmailContact[],
};

const inputCls = "rounded-lg border border-[var(--border)] px-3 py-2.5 text-base sm:py-2 sm:text-sm";

/** Only the base columns exist until migration 0043 is run, so the new ones are sent only when they hold something or the table already has them. */
function buildPayload(form: typeof emptyForm, columnsExist: boolean, emailColumnExists: boolean, addressColumnExists: boolean) {
  const base = { name: form.name, phone: form.phone, email: form.email, notes: form.notes };
  const extras = {
    accounts_contact_name: form.accounts_contact_name.trim() || null,
    accounts_contact_email: form.accounts_contact_email.trim() || null,
    accounts_contact_phone: form.accounts_contact_phone.trim() || null,
    rep_name: form.rep_name.trim() || null,
    rep_phone: form.rep_phone.trim() || null,
    rep_email: form.rep_email.trim() || null,
  };
  const anySet = Object.values(extras).some((v) => v !== null);
  const contacts = form.email_contacts.map((c) => ({ label: c.label.trim(), email: c.email.trim(), po: c.po })).filter((c) => c.email);
  return {
    ...base,
    ...(addressColumnExists || form.address.trim() ? { address: form.address.trim() || null } : {}),
    ...(columnsExist || anySet ? extras : {}),
    ...(emailColumnExists || contacts.length > 0 ? { email_contacts: contacts } : {}),
  };
}

export default function SuppliersTable({ initial, isAdmin }: { initial: Supplier[]; isAdmin: boolean }) {
  const supabase = createClient();
  const [suppliers, setSuppliers] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const columnsExist = suppliers.length > 0 && "rep_name" in suppliers[0];
  const emailColumnExists = suppliers.length > 0 && "email_contacts" in suppliers[0];
  const addressColumnExists = suppliers.length > 0 && "address" in suppliers[0];

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      notes: s.notes || "",
      accounts_contact_name: s.accounts_contact_name || "",
      accounts_contact_email: s.accounts_contact_email || "",
      accounts_contact_phone: s.accounts_contact_phone || "",
      rep_name: s.rep_name || "",
      rep_phone: s.rep_phone || "",
      rep_email: s.rep_email || "",
      email_contacts: contactsOf(s),
    });
    setModalOpen(true);
  }

  function updateContact(i: number, patch: Partial<EmailContact>) {
    setForm((f) => ({ ...f, email_contacts: f.email_contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  }
  function addContact() {
    setForm((f) => ({ ...f, email_contacts: [...f.email_contacts, { label: "", email: "", po: true }] }));
  }
  function removeContact(i: number) {
    setForm((f) => ({ ...f, email_contacts: f.email_contacts.filter((_, idx) => idx !== i) }));
  }

  async function save() {
    setSaving(true);
    if (editing) {
      const { data, error } = await supabase
        .from("suppliers")
        .update(buildPayload(form, columnsExist, emailColumnExists, addressColumnExists))
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setSuppliers((prev) => prev.map((s) => (s.id === editing.id ? (data as Supplier) : s)));
        setModalOpen(false);
        logAudit(supabase, { eventType: "update", entityType: "supplier", entityId: data.id, entityLabel: data.name });
      } else if (error) alert(error.message);
    } else {
      const { data, error } = await supabase.from("suppliers").insert(buildPayload(form, columnsExist, emailColumnExists, addressColumnExists)).select().single();
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

      <div className="mt-4 hidden overflow-x-auto rounded-xl border border-[var(--border)] md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Accounts</th>
              <th className="px-4 py-2">Sales rep</th>
              <th className="px-4 py-2">Other emails</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2">{s.phone || "—"}</td>
                <td className="px-4 py-2 whitespace-pre-line">{s.address || "—"}</td>
                <td className="px-4 py-2">{s.email || "—"}</td>
                <td className="px-4 py-2">
                  <Contact name={s.accounts_contact_name} email={s.accounts_contact_email} phone={s.accounts_contact_phone} />
                </td>
                <td className="px-4 py-2">
                  <Contact name={s.rep_name} email={s.rep_email} phone={s.rep_phone} />
                </td>
                <td className="px-4 py-2">
                  {contactsOf(s).length === 0 && "—"}
                  {contactsOf(s).map((c, i) => (
                    <div key={i} className="text-xs">
                      <span className="text-[var(--muted)]">{c.label || "Email"}:</span> {c.email}
                      {c.po && <span className="ml-1 text-[var(--muted)]">(POs)</span>}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(s)} className="text-accent hover:underline">
                    Edit
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => toggleArchive(s)}
                      className="ml-3 text-[var(--muted)] hover:underline"
                    >
                      {s.archived ? "Restore" : "Archive"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                  No suppliers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Phones and small tablets: one card per supplier instead of a wide table. */}
      <div className="mt-4 flex flex-col gap-3 md:hidden">
        {visible.map((s) => (
          <div key={s.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 break-words text-base font-bold">{s.name}</h2>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <button onClick={() => openEdit(s)} className="min-h-[44px] px-1 font-medium text-accent">
                  Edit
                </button>
                {isAdmin && (
                  <button onClick={() => toggleArchive(s)} className="min-h-[44px] px-1 text-[var(--muted)]">
                    {s.archived ? "Restore" : "Archive"}
                  </button>
                )}
              </div>
            </div>
            {s.address && <div className="mt-1 whitespace-pre-line text-sm text-[var(--muted)]">{s.address}</div>}
            <CardRow label="Main" name={null} phone={s.phone} email={s.email} />
            <CardRow label="Accounts" name={s.accounts_contact_name} phone={s.accounts_contact_phone} email={s.accounts_contact_email} />
            <CardRow label="Sales rep" name={s.rep_name} phone={s.rep_phone} email={s.rep_email} />
            {contactsOf(s).length > 0 && (
              <div className="mt-3 border-t border-[var(--border)] pt-3 text-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Other emails</div>
                {contactsOf(s).map((c, i) => (
                  <div key={i} className="mt-1 break-all">
                    <span className="text-[var(--muted)]">{c.label || "Email"}:</span>{" "}
                    <a href={`mailto:${c.email}`} className="text-accent">
                      {c.email}
                    </a>
                    {c.po && <span className="ml-1 text-xs text-[var(--muted)]">(POs)</span>}
                  </div>
                ))}
              </div>
            )}
            {s.notes && <p className="mt-3 whitespace-pre-wrap border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)]">{s.notes}</p>}
          </div>
        ))}
        {visible.length === 0 && <p className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">No suppliers found.</p>}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-xl bg-[var(--surface)] sm:max-h-[85vh] sm:rounded-xl">
            <div className="border-b border-[var(--border)] px-6 py-4">
              <h2 className="text-lg font-bold">{editing ? "Edit supplier" : "Add supplier"}</h2>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Txt label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} className="sm:col-span-2" />
                <Txt label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                <Txt label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <Txt label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} className="sm:col-span-2" />
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Accounts contact</h3>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Txt label="Contact name" value={form.accounts_contact_name} onChange={(v) => setForm({ ...form, accounts_contact_name: v })} className="sm:col-span-2" />
                  <Txt label="Email" value={form.accounts_contact_email} onChange={(v) => setForm({ ...form, accounts_contact_email: v })} />
                  <Txt label="Phone" value={form.accounts_contact_phone} onChange={(v) => setForm({ ...form, accounts_contact_phone: v })} />
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Sales rep</h3>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Txt label="Rep name" value={form.rep_name} onChange={(v) => setForm({ ...form, rep_name: v })} className="sm:col-span-2" />
                  <Txt label="Phone" value={form.rep_phone} onChange={(v) => setForm({ ...form, rep_phone: v })} />
                  <Txt label="Email" value={form.rep_email} onChange={(v) => setForm({ ...form, rep_email: v })} />
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Email addresses</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Add as many addresses as this supplier needs (orders, accounts, warehouse…). Tick &quot;POs&quot; on the ones that should receive purchase orders.
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {form.email_contacts.map((c, i) => (
                    <div key={i} className="rounded-lg border border-[var(--border)] bg-[#f8f7f4] p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr]">
                        <input
                          className={inputCls}
                          placeholder="Label (e.g. Orders)"
                          value={c.label}
                          onChange={(e) => updateContact(i, { label: e.target.value })}
                        />
                        <input
                          className={inputCls}
                          type="email"
                          inputMode="email"
                          placeholder="email@supplier.com.au"
                          value={c.email}
                          onChange={(e) => updateContact(i, { email: e.target.value })}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-5 w-5" checked={c.po} onChange={(e) => updateContact(i, { po: e.target.checked })} />
                          Send POs to this address
                        </label>
                        <button type="button" onClick={() => removeContact(i)} className="min-h-[44px] px-2 text-sm text-[var(--muted)] hover:text-red-700">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addContact} className="self-start text-sm font-medium text-accent hover:underline">
                    + Add email address
                  </button>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                Notes
                <textarea className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

function Txt({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      {label}
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Contact({ name, email, phone }: { name?: string | null; email?: string | null; phone?: string | null }) {
  if (!name && !email && !phone) return <>—</>;
  return (
    <div>
      {name && <div className="font-medium">{name}</div>}
      {phone && <div className="text-xs text-[var(--muted)]">{phone}</div>}
      {email && <div className="text-xs text-[var(--muted)]">{email}</div>}
    </div>
  );
}

function CardRow({ label, name, phone, email }: { label: string; name?: string | null; phone?: string | null; email?: string | null }) {
  if (!name && !phone && !email) return null;
  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3 text-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      {name && <div className="mt-1 font-medium">{name}</div>}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {phone && (
          <a href={`tel:${phone.replace(/\s+/g, "")}`} className="min-h-[32px] text-accent">
            {phone}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="min-h-[32px] break-all text-accent">
            {email}
          </a>
        )}
      </div>
    </div>
  );
}
