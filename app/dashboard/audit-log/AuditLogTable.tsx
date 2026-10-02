"use client";

import { useMemo, useState } from "react";

type Event = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  event_type: "login" | "create" | "update" | "delete";
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: string | null;
};

const EVENT_BADGE: Record<Event["event_type"], string> = {
  login: "bg-blue-100 text-blue-800",
  create: "bg-green-100 text-green-800",
  update: "bg-amber-100 text-amber-800",
  delete: "bg-red-100 text-red-800",
};

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function entityTypeLabel(t: string) {
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AuditLogTable({ initial }: { initial: Event[] }) {
  const [userFilter, setUserFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [search, setSearch] = useState("");

  const users = useMemo(() => {
    const names = new Set<string>();
    for (const e of initial) if (e.user_name) names.add(e.user_name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [initial]);

  const entityTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of initial) types.add(e.entity_type);
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [initial]);

  const filtered = initial.filter((e) => {
    if (userFilter && e.user_name !== userFilter) return false;
    if (eventFilter && e.event_type !== eventFilter) return false;
    if (entityFilter && e.entity_type !== entityFilter) return false;
    if (search) {
      const needle = search.toLowerCase();
      const haystack = `${e.entity_label || ""} ${e.details || ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        A record of sign-ins and changes made across the app — most recent first. Showing the last{" "}
        {initial.length} event{initial.length === 1 ? "" : "s"}.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          User
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Event type
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2"
          >
            <option value="">All events</option>
            <option value="login">Login</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Record type
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2"
          >
            <option value="">All record types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {entityTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-sm">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search label or details..."
            className="rounded-lg border border-[var(--border)] px-3 py-2"
          />
        </label>
        {(userFilter || eventFilter || entityFilter || search) && (
          <button
            onClick={() => {
              setUserFilter("");
              setEventFilter("");
              setEntityFilter("");
              setSearch("");
            }}
            className="text-sm text-[var(--muted)] underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Record</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-t border-[var(--border)] align-top">
                <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">{fmtDateTime(e.created_at)}</td>
                <td className="px-3 py-2 font-medium">{e.user_name || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${EVENT_BADGE[e.event_type]}`}>
                    {e.event_type}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{entityTypeLabel(e.entity_type)}</div>
                  {e.entity_label && <div className="text-[var(--muted)]">{e.entity_label}</div>}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">{e.details || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                  No events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
