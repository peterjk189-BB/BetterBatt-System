"use client";

import { useState } from "react";

/** Download the purchase order as a PDF, or email it to the supplier (their order addresses are filled in for you). */
export default function PoSendActions({ poId }: { poId: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function openPanel() {
    setNote(null);
    setOpen((o) => !o);
    if (!open && !to) {
      try {
        const r = await fetch(`/api/purchase-orders/email?id=${encodeURIComponent(poId)}`);
        const j = await r.json();
        if (Array.isArray(j.to)) setTo(j.to.join(", "));
      } catch {
        /* they can type the address */
      }
    }
  }

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/purchase-orders/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: poId, to, message }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setNote({ ok: false, text: j.error || "Couldn't send the email." });
      else setNote({ ok: true, text: `Sent to ${to}.` });
    } catch (e: any) {
      setNote({ ok: false, text: e?.message || "Couldn't send the email." });
    }
    setBusy(false);
  }

  return (
    <div className="relative flex items-center gap-2 print:hidden">
      <a
        href={`/api/purchase-orders/pdf?id=${encodeURIComponent(poId)}&download=1`}
        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
      >
        Download PDF
      </a>
      <button onClick={openPanel} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
        Email to supplier
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[22rem] rounded-xl border border-[var(--border)] bg-[var(--surface,#fff)] p-4 text-sm shadow-lg">
          <label className="flex flex-col gap-1">
            Send to (separate several with commas)
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="orders@supplier.com.au"
              className="rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1">
            Message (optional)
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          <p className="mt-2 text-xs text-[var(--muted)]">The purchase order is attached as a PDF.</p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={send} disabled={busy || !to.trim()} className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-60">
              {busy ? "Sending..." : "Send"}
            </button>
            <button onClick={() => setOpen(false)} className="text-[var(--muted)] hover:underline">
              Close
            </button>
          </div>
          {note && <p className={`mt-2 text-sm ${note.ok ? "text-green-700" : "text-red-600"}`}>{note.text}</p>}
        </div>
      )}
    </div>
  );
}
