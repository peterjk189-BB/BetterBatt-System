"use client";

import { useEffect, useState } from "react";

export default function EmailTestForm({ defaultTo }: { defaultTo: string }) {
  const [info, setInfo] = useState<{ keySet: boolean; from: string; usingTestSender: boolean } | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/email/test")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/email/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Test email sent to ${to}. Check your inbox (and spam).` } : { ok: false, text: data.error || "Failed to send" });
  }

  return (
    <div className="mt-8 rounded-xl border border-[var(--border)] p-4">
      <h2 className="text-lg font-semibold">Email (Resend)</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {info === null
          ? "Checking…"
          : !info.keySet
          ? "Not set up yet — RESEND_API_KEY is missing in Vercel."
          : info.usingTestSender
          ? "Key found, but still using Resend's test sender (only delivers to your own Resend login email). Verify your domain and set RESEND_FROM."
          : `Ready. Sending from ${info.from}`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Send test to…"
          className="min-w-[16rem] flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button onClick={send} disabled={busy || !to} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Sending…" : "Send test email"}
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
