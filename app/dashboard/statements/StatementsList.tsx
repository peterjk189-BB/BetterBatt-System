"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { money } from "@/lib/invoices";
import type { Ageing } from "@/lib/statements";

type Row = { id: string; name: string; terms: string; email: string; accountHolder: boolean; ageing: Ageing; lastSent: string | null };

export default function StatementsList({ rows, date, needsMigration }: { rows: Row[]; date: string; needsMigration: boolean }) {
  const router = useRouter();
  const [holdersOnly, setHoldersOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const shown = rows.filter((r) => (holdersOnly ? r.accountHolder : true) && r.ageing.total > 0.005);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sendable = shown.filter((r) => selected.has(r.id));
  const total = shown.reduce((s, r) => s + r.ageing.total, 0);

  async function sendSelected() {
    const withEmail = sendable.filter((r) => r.email);
    const skipped = sendable.length - withEmail.length;
    if (withEmail.length === 0) return setMsg("None of the selected customers have an email address.");
    if (!window.confirm(`Email ${withEmail.length} statement${withEmail.length === 1 ? "" : "s"} dated ${date}?${skipped ? ` (${skipped} skipped – no email)` : ""}`)) return;
    setBusy(true);
    setMsg(null);
    let ok = 0;
    const failed: string[] = [];
    for (const r of withEmail) {
      const res = await fetch("/api/statements/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: r.id, date }) });
      if (res.ok) ok++;
      else failed.push(`${r.name}: ${(await res.json().catch(() => ({}))).error || "failed"}`);
    }
    setBusy(false);
    setSelected(new Set());
    setMsg(`Sent ${ok} statement${ok === 1 ? "" : "s"}.${skipped ? ` ${skipped} skipped (no email).` : ""}${failed.length ? ` Failed – ${failed.join("; ")}` : ""}`);
    router.refresh();
  }

  const th = "px-3 py-2 text-right text-xs font-medium uppercase text-[var(--muted)]";
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customer statements</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Outstanding balances by customer, aged by due date. Tick customers and send their statements in one go.</p>
        </div>
        <label className="text-sm">
          <span className="mr-2 text-[var(--muted)]">Statement date</span>
          <input type="date" value={date} onChange={(e) => router.push(`/dashboard/statements?date=${e.target.value}`)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1" />
        </label>
      </div>

      {needsMigration && <p className="mt-4 rounded-lg bg-[#fff4d6] p-3 text-sm text-[#8a5a00]">Run migration 0055 in Supabase to enable the account-holder flag and the &quot;last sent&quot; log, then refresh.</p>}
      {msg && <p className="mt-4 rounded-lg bg-[var(--surface)] p-3 text-sm border border-[var(--border)]">{msg}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={holdersOnly} onChange={(e) => setHoldersOnly(e.target.checked)} /> Account holders only</label>
        <button className="text-accent" onClick={() => setSelected(new Set(shown.filter((r) => r.email).map((r) => r.id)))}>Select all with email</button>
        <button className="text-[var(--muted)]" onClick={() => setSelected(new Set())}>Clear</button>
        <span className="ml-auto text-[var(--muted)]">{shown.length} customers · {money(total)} owing</span>
        <button disabled={busy || sendable.length === 0} onClick={sendSelected} className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-40">
          {busy ? "Sending…" : `Send selected (${sendable.length})`}
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--muted)]">Customer</th>
              <th className={th}>Current</th><th className={th}>1–30</th><th className={th}>31–60</th><th className={th}>61+</th><th className={th}>Total owing</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-[var(--muted)]">Last sent</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-[var(--muted)]">No outstanding balances{holdersOnly ? " for account holders. Tick “Account holder – send statements” on a customer, or untick the filter above" : ""}.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-3 py-2">
                  <Link href={`/dashboard/statements/${r.id}?date=${date}`} className="font-medium text-accent">{r.name}</Link>
                  <div className="text-xs text-[var(--muted)]">{r.email || <span className="text-[#b91c1c]">no email</span>}{r.terms ? ` · ${r.terms}` : ""}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.ageing.current)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.ageing.d1_30)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.ageing.d31_60)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.ageing.d61 > 0 ? "font-semibold text-[#b91c1c]" : ""}`}>{money(r.ageing.d61)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(r.ageing.total)}</td>
                <td className="px-3 py-2 text-xs text-[var(--muted)]">{r.lastSent ? new Date(r.lastSent).toLocaleDateString("en-AU") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
