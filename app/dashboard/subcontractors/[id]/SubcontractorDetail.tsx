"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SubcontractorPanel, { type Attachment, type Subcontractor } from "../SubcontractorPanel";

export default function SubcontractorDetail({
  subcontractor,
  attachments,
  isAdmin,
  others = [],
}: {
  subcontractor: Subcontractor;
  attachments: Attachment[];
  isAdmin: boolean;
  others?: { id: string; name: string }[];
}) {
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
      body: JSON.stringify({ keepId: subcontractor.id, removeId: dup.id }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !j.ok) {
      setMsg(`Merge problem: ${j.error || (j.errors || []).join("; ") || "unknown error"}`);
      return;
    }
    const total = Object.values(j.moved as Record<string, number>).reduce((a, b) => a + b, 0);
    setMsg(`Merged. ${total} records moved onto ${subcontractor.name}; ${dup.name} is archived.`);
    setDupId("");
    router.refresh();
  }

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/subcontractors" className="text-sm text-[var(--muted)] hover:underline">
        &larr; Back to subcontractors
      </Link>
      {isAdmin && others.length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          <button onClick={() => setOpen(!open)} className="font-medium text-accent hover:underline">
            {open ? "Hide merge" : "Merge a duplicate into this contractor"}
          </button>
          {open && (
            <div className="mt-3 grid gap-2">
              <p className="text-[var(--muted)]">
                Everything on the duplicate (work orders, pay lines, files, onboarding details, insurance, login) moves onto <b>{subcontractor.name}</b>. Blank details here are filled from the duplicate, then the duplicate is archived.
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
                    Merge <b>{dup.name}</b> into <b>{subcontractor.name}</b>? This can&apos;t be undone.
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
      )}
      <div className="mt-2">
        <SubcontractorPanel subcontractor={subcontractor} attachments={attachments} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
