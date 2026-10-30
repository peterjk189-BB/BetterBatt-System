"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SubmitInvoice({ workOrderId, hasExtras }: { workOrderId: string; hasExtras: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!confirm("Submit this tax invoice to Better Batt? You can't change it afterwards.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contractor-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_order_id: workOrderId, note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Something went wrong.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Couldn't submit. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <label className="flex flex-col gap-1 text-sm">
        Note for the office (optional)
        <input className="rounded-lg border border-[var(--border)] px-3 py-2" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. PO or job reference" />
      </label>
      {hasExtras && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Your unapproved extras are listed on the invoice but not charged. Once the office approves one, you can send a follow-up invoice for it.
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={submit} disabled={busy} className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Submitting…" : "Submit to Better Batt"}
        </button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </div>
  );
}
