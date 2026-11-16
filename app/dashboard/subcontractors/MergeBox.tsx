"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Admin-only: merge a duplicate contractor into the one shown. */
export default function MergeBox({ keepId, keepName, others }: { keepId: string; keepName: string; others: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dupId, setDupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dup = others.find((o) => o.id === dupId);

  async function merge() {
    if (!dup) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/subcontractors/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId, removeId: dup.id }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !j.ok) {
      setMsg(`Merge problem: ${j.error || (j.errors || []).join("; ") || "unknown error"}`);
      return;
    }
    const total = Object.values(j.moved as Record<string, number>).reduce((a, b) => a + b, 0);
    setMsg(`Merged. ${total} records moved onto ${keepName}; ${dup.name} is archived. Reloading…`);
    setDupId("");
    setTimeout(() => window.location.reload(), 1200);
  }

  if (others.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
      <button onClick={() => setOpen(!open)} className="font-medium text-accent hover:underline">
        {open ? "Hide merge" : "Merge a duplicate into this contractor"}
      </button>
      {open && (
        <div className="mt-3 grid gap-2">
          <p className="text-[var(--muted)]">
            Everything on the duplicate (work orders, pay lines, files, onboarding details, insurance, login) moves onto <b>{keepName}</b>. Blank details here are filled from the duplicate, then the duplicate is archived.
          </p>
          <select className="rounded-lg border border-[var(--border)] px-3 py-2" value={dupId} onChange={(e) => setDupId(e.target.value)}>
            <option value="">Choose the duplicate to merge in…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {dup && (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Merge <b>{dup.name}</b> into <b>{keepName}</b>? This can&apos;t be undone.
              </span>
              <button onClick={merge} disabled={busy} className="rounded-lg bg-[#b91c1c] px-4 py-2 font-medium text-white disabled:opacity-60">
                {busy ? "Merging…" : "Yes, merge"}
              </button>
            </div>
          )}
        </div>
      )}
      {msg && <p className="mt-2 font-medium">{msg}</p>}
    </div>
  );
}
