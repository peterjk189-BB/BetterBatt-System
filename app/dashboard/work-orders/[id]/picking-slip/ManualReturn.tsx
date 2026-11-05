"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type ReturnPart = { id: string; name: string; pack_per_multi: number };
export type ManualReturnRow = { id: string; part_id: string; multi: number; packs: number; estimated: boolean; note: string | null; created_at: string };

/** Office records stock that came back from a job (multis + loose packs). Goes back on the shelf and off the job's cost. */
export default function ManualReturn({ workOrderId, parts, rows, available }: { workOrderId: string; parts: ReturnPart[]; rows: ManualReturnRow[]; available: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [multi, setMulti] = useState("");
  const [packs, setPacks] = useState("");
  const [estimated, setEstimated] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string) => parts.find((p) => p.id === id)?.name ?? "Product";

  async function add() {
    setError(null);
    setBusy(true);
    const { error: e } = await supabase.rpc("add_wo_stock_return", {
      p_wo: workOrderId, p_part: partId, p_multi: Number(multi) || 0, p_pks: Number(packs) || 0, p_estimated: estimated, p_note: note,
    });
    setBusy(false);
    if (e) return setError(/add_wo_stock_return|schema cache/i.test(e.message) ? "Run migration 0089 in Supabase first." : e.message);
    setMulti(""); setPacks(""); setNote("");
    router.refresh();
  }
  async function remove(id: string) {
    setBusy(true);
    const { error: e } = await supabase.rpc("delete_wo_stock_return", { p_id: id });
    setBusy(false);
    if (e) return setError(e.message);
    router.refresh();
  }

  if (parts.length === 0) return null;
  return (
    <section className="mx-auto mt-6 max-w-5xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 print:hidden">
      <h2 className="text-base font-bold">Manual return to stock</h2>
      <p className="mt-0.5 text-xs text-[var(--muted)]">Stock that came back from this job. It goes back on the shelf and the job&apos;s material cost drops by the same amount. Leave “Estimated” ticked for a rough count.</p>
      {!available && <p className="mt-2 text-xs text-amber-700">Run migration 0089 in Supabase to switch this on.</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs">Product
          <select className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" value={partId} onChange={(e) => setPartId(e.target.value)}>
            {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">Multis
          <input type="number" min="0" step="1" className="w-20 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" value={multi} onChange={(e) => setMulti(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">Loose packs
          <input type="number" min="0" step="1" className="w-24 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" value={packs} onChange={(e) => setPacks(e.target.value)} />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs">Note (optional)
          <input className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs"><input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} />Estimated</label>
        <button type="button" disabled={busy || !partId || !available} onClick={add} className="rounded-lg bg-[var(--brand-gold)] px-4 py-2 text-sm font-semibold text-[#201f1c] disabled:opacity-50">Return to stock</button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                {nameOf(r.part_id)} — <b>{[r.multi ? `${r.multi} multi` : "", r.packs ? `${r.packs} pack${r.packs === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ")}</b>
                {r.estimated && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] text-amber-600">estimated</span>}
                {r.note && <span className="ml-2 text-[var(--muted)]">{r.note}</span>}
                <span className="ml-2 text-xs text-[var(--muted)]">{new Date(r.created_at).toLocaleDateString("en-AU")}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => remove(r.id)} className="text-xs text-[var(--muted)] underline hover:text-red-600">Undo</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
