"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };

export default function PreviewBar({
  users,
  previewing,
}: {
  users: Option[];
  previewing: { id: string; label: string } | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setPreview(userId: string) {
    if (!userId) return;
    setLoading(true);
    await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    router.refresh();
    setLoading(false);
  }

  async function exitPreview() {
    setLoading(true);
    await fetch("/api/preview", { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  if (previewing) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
        <span>Previewing as {previewing.label}</span>
        <button onClick={exitPreview} disabled={loading} className="underline disabled:opacity-60">
          {loading ? "..." : "Exit preview"}
        </button>
      </div>
    );
  }

  if (users.length === 0) return null;

  return (
    <select
      defaultValue=""
      disabled={loading}
      onChange={(e) => setPreview(e.target.value)}
      className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]"
    >
      <option value="">Preview as…</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.label}
        </option>
      ))}
    </select>
  );
}
