"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

type Role = "admin" | "office" | "installer";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  subcontractor_id: string | null;
  last_sign_in_at: string | null;
  invited_at: string | null;
  confirmed_at: string | null;
};

type Sub = { id: string; name: string };

const emptyForm = {
  email: "",
  full_name: "",
  role: "installer" as Role,
  subcontractor_id: "",
};

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export default function UsersTable({
  initial,
  subcontractors,
  currentUserId,
}: {
  initial: User[];
  subcontractors: Sub[];
  currentUserId: string;
}) {
  const supabase = createClient();
  const [users, setUsers] = useState(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const subById = new Map(subcontractors.map((s) => [s.id, s.name]));

  async function updateRole(u: User, role: Role) {
    setSavingId(u.id);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", u.id);
    setSavingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
    logAudit(supabase, {
      eventType: "update",
      entityType: "user",
      entityId: u.id,
      entityLabel: u.email,
      details: `Role changed to ${role}`,
    });
  }

  async function updateSubcontractor(u: User, subcontractorId: string) {
    setSavingId(u.id);
    const { error } = await supabase
      .from("profiles")
      .update({ subcontractor_id: subcontractorId || null })
      .eq("id", u.id);
    setSavingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, subcontractor_id: subcontractorId || null } : x))
    );
    logAudit(supabase, {
      eventType: "update",
      entityType: "user",
      entityId: u.id,
      entityLabel: u.email,
      details: subcontractorId
        ? `Linked to subcontractor ${subById.get(subcontractorId) || subcontractorId}`
        : "Unlinked from subcontractor",
    });
  }

  async function removeUser(u: User) {
    if (!confirm(`Remove ${u.email}? They'll lose access immediately. This can't be undone.`)) return;
    setRemovingId(u.id);
    const res = await fetch("/api/users/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    });
    const body = await res.json();
    setRemovingId(null);
    if (!res.ok) {
      alert(body.error || "Failed to remove user");
      return;
    }
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    logAudit(supabase, { eventType: "delete", entityType: "user", entityId: u.id, entityLabel: u.email });
  }

  async function invite() {
    setInviting(true);
    setInviteError(null);
    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json();
    setInviting(false);
    if (!res.ok) {
      setInviteError(body.error || "Failed to invite user");
      return;
    }
    setUsers((prev) =>
      [
        ...prev,
        {
          id: body.id,
          email: body.email,
          full_name: form.full_name,
          role: form.role,
          subcontractor_id: form.subcontractor_id || null,
          last_sign_in_at: null,
          invited_at: new Date().toISOString(),
          confirmed_at: null,
        },
      ].sort((a, b) => a.email.localeCompare(b.email))
    );
    setForm(emptyForm);
    setModalOpen(false);
    logAudit(supabase, {
      eventType: "create",
      entityType: "user",
      entityId: body.id,
      entityLabel: body.email,
      details: `Invited as ${form.role}`,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <button
          onClick={() => {
            setForm(emptyForm);
            setInviteError(null);
            setModalOpen(true);
          }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Invite user
        </button>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Admins see and manage everything, including this Users page. Office has the same day-to-day access
        (Quotes, Work Orders, Contractor Payments, etc.) but can&rsquo;t manage users. Installers only see their
        own assigned work orders — link them to a subcontractor record so the system knows which jobs are
        theirs.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Linked subcontractor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last sign in</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">
                  {u.full_name || "—"}
                  {u.id === currentUserId && (
                    <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">You</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">{u.email}</td>
                <td className="px-3 py-2">
                  <select
                    value={u.role}
                    disabled={savingId === u.id || u.id === currentUserId}
                    onChange={(e) => updateRole(u, e.target.value as Role)}
                    className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="office">Office</option>
                    <option value="installer">Installer</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={u.subcontractor_id || ""}
                    disabled={savingId === u.id}
                    onChange={(e) => updateSubcontractor(u, e.target.value)}
                    className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
                  >
                    <option value="">— none —</option>
                    {subcontractors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {u.confirmed_at ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Active</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Invited, not yet confirmed
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">{fmtDateTime(u.last_sign_in_at)}</td>
                <td className="px-3 py-2 text-right">
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => removeUser(u)}
                      disabled={removingId === u.id}
                      className="text-red-700 hover:underline disabled:opacity-60"
                    >
                      {removingId === u.id ? "Removing..." : "Remove"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-6 py-4">
              <h2 className="text-lg font-bold">Invite user</h2>
            </div>
            <div className="space-y-4 px-6 py-4">
              {inviteError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{inviteError}</p>
              )}
              <label className="flex flex-col gap-1 text-sm">
                Email
                <input
                  type="email"
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Full name
                <input
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Role
                <select
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  <option value="installer">Installer</option>
                  <option value="office">Office</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              {form.role === "installer" && (
                <label className="flex flex-col gap-1 text-sm">
                  Linked subcontractor (optional)
                  <select
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.subcontractor_id}
                    onChange={(e) => setForm({ ...form, subcontractor_id: e.target.value })}
                  >
                    <option value="">— none —</option>
                    {subcontractors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="text-xs text-[var(--muted)]">
                They&rsquo;ll get an email with a link to set their password and sign in.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
              <button onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={invite}
                disabled={inviting || !form.email}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {inviting ? "Sending invite..." : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
