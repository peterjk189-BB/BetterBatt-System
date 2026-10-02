"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { ALL_TABS, defaultTabsForRole, effectiveTabs } from "@/lib/tabs";

type Role = "admin" | "office" | "installer";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  subcontractor_id: string | null;
  allowed_tabs: string[] | null;
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
  const [tabsEditingUser, setTabsEditingUser] = useState<User | null>(null);
  const [tabsDraft, setTabsDraft] = useState<string[]>([]);
  const [savingTabs, setSavingTabs] = useState(false);

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

  function openTabsEditor(u: User) {
    setTabsEditingUser(u);
    setTabsDraft(effectiveTabs(u.role, u.allowed_tabs));
  }

  function toggleDraftTab(key: string) {
    setTabsDraft((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function saveTabs() {
    if (!tabsEditingUser) return;
    const u = tabsEditingUser;
    setSavingTabs(true);
    const { error } = await supabase.from("profiles").update({ allowed_tabs: tabsDraft }).eq("id", u.id);
    setSavingTabs(false);
    if (error) {
      alert(error.message);
      return;
    }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, allowed_tabs: tabsDraft } : x)));
    logAudit(supabase, {
      eventType: "update",
      entityType: "user",
      entityId: u.id,
      entityLabel: u.email,
      details: `Tab access set to: ${tabsDraft.length ? tabsDraft.join(", ") : "none"}`,
    });
    setTabsEditingUser(null);
  }

  async function resetTabsToDefault() {
    if (!tabsEditingUser) return;
    const u = tabsEditingUser;
    setSavingTabs(true);
    const { error } = await supabase.from("profiles").update({ allowed_tabs: null }).eq("id", u.id);
    setSavingTabs(false);
    if (error) {
      alert(error.message);
      return;
    }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, allowed_tabs: null } : x)));
    logAudit(supabase, {
      eventType: "update",
      entityType: "user",
      entityId: u.id,
      entityLabel: u.email,
      details: `Tab access reset to default for role (${u.role})`,
    });
    setTabsEditingUser(null);
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
          allowed_tabs: null,
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

  function tabsSummary(u: User) {
    if (!u.allowed_tabs) return `Default (${u.role})`;
    if (u.allowed_tabs.length === 0) return "No tabs";
    if (u.allowed_tabs.length === ALL_TABS.length) return "All tabs";
    return `${u.allowed_tabs.length} tab${u.allowed_tabs.length === 1 ? "" : "s"}`;
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
        own assigned work orders by default — link them to a subcontractor record so the system knows which
        jobs are theirs. Use &ldquo;Edit tabs&rdquo; on any user to pick exactly which pages they can see,
        overriding their role&rsquo;s default set — e.g. a subcontractor granted just the Work Orders tab.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Linked subcontractor</th>
              <th className="px-3 py-2">Tabs</th>
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
                <td className="px-3 py-2">
                  <button onClick={() => openTabsEditor(u)} className="text-left text-accent hover:underline">
                    {tabsSummary(u)}
                  </button>
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
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
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
                They&rsquo;ll get an email with a link to set their password and sign in. You can pick exactly
                which tabs they see afterwards from the Users list.
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

      {tabsEditingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-6 py-4">
              <h2 className="text-lg font-bold">Tabs for {tabsEditingUser.full_name || tabsEditingUser.email}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Pick exactly which pages this person can see. Role: {tabsEditingUser.role}.
              </p>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto px-6 py-4">
              {ALL_TABS.map((t) => {
                const disabled = t.adminOnly && tabsEditingUser.role !== "admin";
                return (
                  <label
                    key={t.key}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      disabled ? "opacity-40" : "hover:bg-[#f2f0ec]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={tabsDraft.includes(t.key)}
                      disabled={disabled}
                      onChange={() => toggleDraftTab(t.key)}
                    />
                    {t.label}
                    {t.adminOnly && (
                      <span className="ml-auto text-xs text-[var(--muted)]">
                        {disabled ? "admin only" : ""}
                      </span>
                    )}
                  </label>
                );
              })}
              <div className="flex gap-3 pt-2 text-xs">
                <button
                  onClick={() =>
                    setTabsDraft(
                      ALL_TABS.filter((t) => !t.adminOnly || tabsEditingUser.role === "admin").map((t) => t.key)
                    )
                  }
                  className="text-accent underline"
                >
                  Select all
                </button>
                <button onClick={() => setTabsDraft([])} className="text-accent underline">
                  Clear all
                </button>
              </div>
              <p className="pt-2 text-xs text-[var(--muted)]">
                Default for {tabsEditingUser.role}:{" "}
                {defaultTabsForRole(tabsEditingUser.role).length
                  ? defaultTabsForRole(tabsEditingUser.role)
                      .map((k) => ALL_TABS.find((t) => t.key === k)?.label || k)
                      .join(", ")
                  : "none"}
              </p>
            </div>
            <div className="flex justify-between gap-3 border-t border-[var(--border)] px-6 py-4">
              <button onClick={resetTabsToDefault} disabled={savingTabs} className="text-sm text-[var(--muted)] underline">
                Reset to role default
              </button>
              <div className="flex gap-3">
                <button onClick={() => setTabsEditingUser(null)} className="rounded-lg px-4 py-2 text-sm">
                  Cancel
                </button>
                <button
                  onClick={saveTabs}
                  disabled={savingTabs}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {savingTabs ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
