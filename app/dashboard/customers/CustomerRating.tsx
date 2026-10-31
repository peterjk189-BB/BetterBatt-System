"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, GRADE_COLOR, GRADE_RULE, loadRating, type Grade, type RatingNote } from "@/lib/builderRating";

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const fmt = (s: string) => new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const SEV: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "#e0523f" },
  med: { label: "Medium", color: "#d99a0b" },
  low: { label: "Low", color: "#8b8982" },
  good: { label: "Positive", color: "#2fa763" },
};

export function GradeBadge({ grade, size = 22 }: { grade: Grade | null; size?: number }) {
  if (!grade) return <span className="text-xs text-[var(--muted)]">—</span>;
  return (
    <span
      title={`Grade ${grade}`}
      style={{ width: size, height: size, borderColor: GRADE_COLOR[grade], color: GRADE_COLOR[grade], fontSize: size * 0.55 }}
      className="inline-grid place-items-center rounded-md border-2 font-extrabold leading-none"
    >
      {grade}
    </span>
  );
}

export default function CustomerRating({ customerId, name, override, canOverride, onOverride }: { customerId: string; name: string; override: string | null; canOverride: boolean; onOverride: (g: string | null) => void }) {
  const supabase = createClient();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadRating>> | null>(null);
  const [ov, setOv] = useState(override || "");
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [sev, setSev] = useState("low");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(o = ov) {
    setData(await loadRating(supabase, customerId, o || null));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function changeOverride(v: string) {
    setOv(v);
    setMsg("");
    const { error } = await supabase.from("customers").update({ rating_override: v || null } as any).eq("id", customerId);
    if (error) setMsg(error.message.includes("rating_override") ? "Run migration 0080 in Supabase first." : error.message);
    else onOverride(v || null);
    load(v);
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setMsg("");
    const { data: u } = await supabase.auth.getUser();
    let who: string | null = null;
    if (u.user) {
      const p: any = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      who = p?.data?.full_name || u.user.email || null;
    }
    const { error } = await supabase.from("customer_notes").insert({ customer_id: customerId, category: cat, severity: sev, note: text.trim(), created_by: u.user?.id ?? null, created_by_name: who } as any);
    setSaving(false);
    if (error) {
      setMsg(error.message.includes("customer_notes") ? "Run migration 0080 in Supabase first." : error.message);
      return;
    }
    setText("");
    load();
  }

  async function delNote(n: RatingNote) {
    if (!confirm("Delete this note?")) return;
    await supabase.from("customer_notes").delete().eq("id", n.id);
    load();
  }

  if (!data) return <p className="py-6 text-sm text-[var(--muted)]">Loading…</p>;
  const r = data.result;
  const g = r.grade;
  const onTime = r.n ? Math.round((1 - r.lateRate) * 100) : null;
  const warn = g === "C" || g === "D";

  return (
    <div className="space-y-4 py-3 text-sm">
      {warn && g && (
        <div className="rounded-lg border p-3" style={{ borderColor: GRADE_COLOR[g] }}>
          <p className="font-semibold" style={{ color: GRADE_COLOR[g] }}>{g === "D" ? "Do not book without approval." : "Watch this builder: payments are running late."}</p>
          <p>{GRADE_RULE[g]}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GradeBadge grade={g} size={48} />
          <div>
            <p className="font-semibold">{name}</p>
            <p className="text-xs text-[var(--muted)]">{g ? GRADE_RULE[g] : "No payment history or notes yet, so no grade."}</p>
          </div>
        </div>
        {canOverride && (
          <label className="text-xs text-[var(--muted)]">
            Grade
            <select value={ov} onChange={(e) => changeOverride(e.target.value)} className="mt-1 block rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
              <option value="">Automatic{r.auto ? ` (${r.auto})` : ""}</option>
              {["A", "B", "C", "D"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        )}
      </div>
      {r.overridden && <p className="text-xs text-[var(--muted)]">Overridden by the office. The system suggests {r.auto}.</p>}

      <div className="grid grid-cols-2 gap-2">
        {[
          ["Paid on time", onTime === null ? "—" : `${onTime}%`, `${r.n} invoices counted`],
          ["Avg days late", r.n ? r.avgLate.toFixed(1) : "—", "of late invoices"],
          ["Overdue now", money(r.overdueBalance), r.overdueCount ? `${r.overdueCount} invoice${r.overdueCount === 1 ? "" : "s"}, oldest ${r.maxOverdue} days` : "nothing outstanding"],
          ["High notes (6 months)", String(r.recentHigh), "each drops the grade one step"],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-lg border border-[var(--border)] p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{l}</p>
            <p className="text-lg font-semibold tabular-nums">{v}</p>
            <p className="text-xs text-[var(--muted)]">{s}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1 font-semibold">Recent invoices</p>
        {r.rows.length === 0 ? <p className="text-xs text-[var(--muted)]">No invoices due or paid yet.</p> : (
          <table className="w-full text-xs">
            <thead className="text-left uppercase text-[var(--muted)]"><tr><th className="py-1">Invoice</th><th>Due</th><th>Paid</th><th className="text-right">Days late</th></tr></thead>
            <tbody>
              {r.rows.slice(0, 8).map((x) => (
                <tr key={x.id} className="border-t border-[var(--border)]">
                  <td className="py-1">INV-{x.number}</td><td>{fmt(x.due)}</td><td>{x.paidOn ? fmt(x.paidOn) : "—"}</td>
                  <td className="text-right tabular-nums" style={{ color: (x.overdueDays || x.daysLate) ? "#e0523f" : undefined }}>{x.overdueDays !== null ? `Overdue ${x.overdueDays}` : x.daysLate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <p className="mb-1 font-semibold">Notes</p>
        <p className="mb-2 text-xs text-[var(--muted)]">Staff only. Keep to facts: dates, amounts and what happened.</p>
        {data.notes.length === 0 && <p className="text-xs text-[var(--muted)]">{data.notesAvailable ? "No notes yet." : "Run migration 0080 in Supabase to turn notes on."}</p>}
        {data.notes.map((n) => (
          <div key={n.id} className="border-t border-[var(--border)] py-2">
            <div className="flex items-center justify-between gap-2">
              <span><span className="mr-2 rounded-full border px-2 text-[11px] font-semibold" style={{ color: SEV[n.severity].color, borderColor: SEV[n.severity].color }}>{SEV[n.severity].label}</span><b>{n.category}</b></span>
              <button onClick={() => delNote(n)} className="text-xs text-[var(--muted)] hover:underline">Delete</button>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{n.note}</p>
            <p className="text-xs text-[var(--muted)]">{fmt(n.created_at)}{n.created_by_name ? ` · ${n.created_by_name}` : ""}</p>
          </div>
        ))}
        <form onSubmit={addNote} className="mt-2 space-y-2 border-t border-[var(--border)] pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[var(--muted)]">Category<select value={cat} onChange={(e) => setCat(e.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-xs text-[var(--muted)]">Severity<select value={sev} onChange={(e) => setSev(e.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option><option value="good">Positive</option></select></label>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened? e.g. INV-1182 paid 24 days after due date, after three reminders." className="min-h-[64px] w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
          <button disabled={saving || !text.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving…" : "Add note"}</button>
          {msg && <p className="text-xs text-red-600">{msg}</p>}
        </form>
      </div>
    </div>
  );
}
