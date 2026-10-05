"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { fmtPacks, fmtSplit, lineStatus, packsNeeded, suggestedPick, suggestedSplit, STATUS_LABELS, STATUS_STYLES } from "@/lib/picking";

type Part = {
  id: string;
  name: string;
  code: string | null;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  supplier_id: string | null;
  stock_on_hand: number;
  pack_per_multi: number;
  multi: number;
  pks: number;
};

type Line = {
  id: string;
  qty: number;
  note: string | null;
  part_id: string;
  allocated: boolean;
  allocated_at: string | null;
  picked: boolean;
  picked_at: string | null;
  multi_picked: number | null;
  packs_picked: number | null;
  parts: Part;
};

function fmtDateTime(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PickingSlip({
  workOrder,
  lines,
  reservedByPart,
}: {
  workOrder: { id: string; wo_number: string; address: string | null; customerName: string | null; quoteNumber: number | null };
  lines: Line[];
  reservedByPart: Record<string, number>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickMulti, setPickMulti] = useState<Record<string, string>>({});
  const [pickPks, setPickPks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function run(lineId: string, label: string, action: () => Promise<{ error: any }>) {
    setBusyId(lineId);
    setError(null);
    const { error: err } = await action();
    setBusyId(null);
    if (err) {
      setError(err.message || `Failed to ${label}`);
      return;
    }
    await logAudit(supabase, {
      eventType: "update",
      entityType: "work order line",
      entityId: lineId,
      entityLabel: `WO${workOrder.wo_number}`,
      details: label,
    });
    router.refresh();
  }

  const allocate = (l: Line) =>
    run(l.id, "Allocated from stock", async () => await supabase.rpc("allocate_wo_line", { p_line_id: l.id }));
  const deallocate = (l: Line) =>
    run(l.id, "Released allocation", async () => await supabase.rpc("deallocate_wo_line", { p_line_id: l.id }));
  const unpick = (l: Line) =>
    run(l.id, "Undid pick", async () => await supabase.rpc("unpick_wo_line", { p_line_id: l.id }));
  const pick = (l: Line) => {
    const suggested = suggestedSplit(suggestedPick(l.qty, l.parts.coverage_m2), l.parts.pack_per_multi, l.parts.multi, l.parts.pks);
    const multi = Math.round(Number(pickMulti[l.id] ?? suggested.multi)) || 0;
    const pks = Math.round(Number(pickPks[l.id] ?? suggested.pks)) || 0;
    if (multi <= 0 && pks <= 0) {
      setError("Enter how many multis and/or packs you're picking.");
      return;
    }
    return run(l.id, `Picked ${fmtSplit(multi, pks)}`, async () =>
      await supabase.rpc("pick_wo_line", { p_line_id: l.id, p_multi: multi, p_pks: pks })
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/work-orders/${workOrder.id}`} className="text-sm text-[var(--muted)] hover:underline">
          &larr; Work order WO{workOrder.wo_number}
        </Link>
        <Link
          href={`/dashboard/work-orders/${workOrder.id}/picking-slip/print`}
          target="_blank"
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          Print picking slip
        </Link>
      </div>
      <h1 className="mt-1 text-2xl font-bold">Picking slip — WO{workOrder.wo_number}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {[workOrder.customerName, workOrder.address].filter(Boolean).join(" — ") || "No address on file"}
        {workOrder.quoteNumber ? ` · Q${workOrder.quoteNumber}` : ""}
      </p>

      {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      {lines.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)]">
          This work order has no material (product) lines to pick — only labour lines.
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Needed (m²)</th>
              <th className="px-3 py-2 text-right">Packs needed</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Reserved elsewhere</th>
              <th className="px-3 py-2 text-right">Available</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const qty = Number(l.qty) || 0;
              const stockOnHand = Number(l.parts.stock_on_hand) || 0;
              const needed = packsNeeded(qty, Number(l.parts.coverage_m2) || 0);
              const reserved = reservedByPart[l.part_id] || 0;
              const available = stockOnHand - reserved;
              const shortfall = Math.max(0, Math.ceil(needed - available - 1e-9));
              const status = lineStatus(l);
              const busy = busyId === l.id;

              return (
                <tr key={l.id} className="border-t border-[var(--border)] align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.parts.name}</div>
                    {l.note && <div className="text-xs text-[var(--muted)]">{l.note}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{needed || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{stockOnHand}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">{reserved || "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${available < needed ? "text-red-700" : ""}`}>
                    {Math.round(available * 100) / 100}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                    {status === "picked" && l.picked_at && (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {fmtSplit(l.multi_picked || 0, l.packs_picked || 0)} · {fmtDateTime(l.picked_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-end gap-1.5">
                      {status === "not-allocated" && (
                        <button
                          onClick={() => allocate(l)}
                          disabled={busy}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-60"
                        >
                          Allocate
                        </button>
                      )}
                      {status === "allocated" && (() => {
                        const suggested = suggestedSplit(needed, l.parts.pack_per_multi, l.parts.multi, l.parts.pks);
                        return (
                          <>
                            <div className="flex items-end gap-1.5">
                              <label className="flex flex-col items-end text-[10px] text-[var(--muted)]">
                                Multi
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  placeholder={String(suggested.multi)}
                                  value={pickMulti[l.id] ?? ""}
                                  onChange={(e) => setPickMulti((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                  className="w-14 rounded-lg border border-[var(--border)] px-2 py-1.5 text-right text-xs"
                                />
                              </label>
                              <label className="flex flex-col items-end text-[10px] text-[var(--muted)]">
                                Pks
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  placeholder={String(suggested.pks)}
                                  value={pickPks[l.id] ?? ""}
                                  onChange={(e) => setPickPks((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                  className="w-14 rounded-lg border border-[var(--border)] px-2 py-1.5 text-right text-xs"
                                />
                              </label>
                              <button
                                onClick={() => pick(l)}
                                disabled={busy}
                                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                              >
                                Confirm pick
                              </button>
                            </div>
                            <button onClick={() => deallocate(l)} disabled={busy} className="text-xs text-[var(--muted)] hover:underline">
                              Release allocation
                            </button>
                          </>
                        );
                      })()}
                      {status === "picked" && (
                        <button onClick={() => unpick(l)} disabled={busy} className="text-xs text-[var(--muted)] hover:underline">
                          Undo pick
                        </button>
                      )}
                      {shortfall > 0 && status !== "picked" && (
                        <Link
                          href={`/dashboard/purchase-orders/new?part_id=${l.part_id}&qty=${shortfall}&supplier_id=${
                            l.parts.supplier_id || ""
                          }&address=${encodeURIComponent(workOrder.address || "")}&note=${encodeURIComponent(
                            `Shortfall for WO${workOrder.wo_number}${workOrder.customerName ? " — " + workOrder.customerName : ""}`
                          )}`}
                          className="text-xs font-medium text-red-700 hover:underline"
                        >
                          Order shortfall ({fmtPacks(shortfall)})
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
