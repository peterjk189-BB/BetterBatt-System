"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };

const SAMPLE_OPTIONS = [
  { value: "sample:office", label: "Sample Office view (no login)" },
  { value: "sample:installer", label: "Sample Installer/Contractor view (no login)" },
];

export default function PreviewBar({
  users,
  previewing,
}: {
  users: Option[];
  previewing: { id: string; label: string } | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setPreview(value: string) {
    if (!value) return;
    setLoading(true);
    const isSample = value.startsWith("sample:");
    await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isSample ? { sample_role: value.slice("sample:".length) } : { user_id: value }),
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

  return (
    <select
      defaultValue=""
      disabled={loading}
      onChange={(e) => setPreview(e.target.value)}
      className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]"
    >
      <option value="">Preview as…</option>
      <optgroup label="Sample views (no login needed)">
        {SAMPLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </optgroup>
      {users.length > 0 && (
        <optgroup label="Real users">
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
