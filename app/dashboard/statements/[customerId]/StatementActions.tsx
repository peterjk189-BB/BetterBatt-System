"use client";
import { useState } from "react";

export default function StatementActions({ customerId, date, defaultEmail }: { customerId: string; date: string; defaultEmail: string }) {
  const [to, setTo] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/statements/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customerId, date, to }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `Sent to ${j.to}.` : j.error || "Failed to send");
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <a href={`/api/statements/pdf?customer_id=${customerId}&date=${date}`} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Download PDF</a>
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="accounts email" className="min-w-[14rem] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
      <button onClick={send} disabled={busy || !to} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? "Sending…" : "Email statement"}</button>
      {msg && <span className="text-sm text-[var(--muted)]">{msg}</span>}
    </div>
  );
}
