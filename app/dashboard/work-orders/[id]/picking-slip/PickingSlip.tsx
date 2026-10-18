"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { fmtPacks, fmtSplit, lineStatus, packsNeeded, STATUS_LABELS, STATUS_STYLES } from "@/lib/picking";

type Part = {
  id: string;
  name: string;
  code: string | null;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  supplier_id: string | null;
  stock_on_hand: number;
  pack_per_multi: number;
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
  multi_returned: number;
  packs_returned: number;
  returned_at: string | null;
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
  onDraft = {},
}: {
  workOrder: { id: string; wo_number: string; address: string | null; customerName: string | null; quoteNumber: number | null; deliveryDate?: string | null };
  lines: Line[];
  reservedByPart: Record<string, number>;
  /** Shortfalls already on a draft purchase order for this job, by part. */
  onDraft?: Record<string, { poId: string; poNumber: string; qty: number }>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickMulti, setPickMulti] = useState<Record<string, string>>({});
  const [pickPks, setPickPks] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState(onDraft);
  const [orderMsg, setOrderMsg] = useState<{ poId: string; text: string } | null>(null);
  const [retMulti, setRetMulti] = useState<Record<string, string>>({});
  const [retPks, setRetPks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(workOrder.deliveryDate || "");
  const [dateStatus, setDateStatus] = useState<"" | "saving" | "saved">("");

  async function saveDeliveryDate(value: string) {
    setDeliveryDate(value);
    setDateStatus("saving");
    setError(null);
    const { error: err } = await supabase
      .from("work_orders")
      .update({ stock_delivery_date: value || null })
      .eq("id", workOrder.id);
    if (err) {
      setDateStatus("");
      setError(err.message?.includes("stock_delivery_date") ? "Couldn't save the delivery date — run migration 0028 in Supabase first." : err.message);
      return;
    }
    setDateStatus("saved");
    logAudit(supabase, {
      eventType: "update",
      entityType: "work order",
      entityId: workOrder.id,
      entityLabel: `WO${workOrder.wo_number}`,
      details: value ? `Stock delivery date ${value}` : "Stock delivery date cleared",
    });
  }

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
  /** One click: add this shortfall to the open draft PO for the supplier (or start one), without leaving the slip. */
  async function orderShortfall(l: Line, shortfall: number) {
    setBusyId(l.id);
    setError(null);
    setOrderMsg(null);
    try {
      const supplierId = l.parts.supplier_id || null;
      const cost = Number(l.parts.pack_cost_ex_gst) || 0;
      const jobNote = `Shortfall for WO${workOrder.wo_number}${workOrder.customerName ? " — " + workOrder.customerName : ""}`;

      // The draft this job already has for this part, otherwise the newest open draft for the supplier.
      let poId = drafts[l.part_id]?.poId ?? null;
      let poNumber = drafts[l.part_id]?.poNumber ?? "";
      if (!poId) {
        let q = supabase.from("purchase_orders").select("id, po_number, notes").eq("status", "Draft").eq("archived", false);
        q = supplierId ? q.eq("supplier_id", supplierId) : q.is("supplier_id", null);
        const { data: found } = await q.order("created_at", { ascending: false }).limit(1);
        const existing = (found ?? [])[0] as any;
        if (existing) {
          poId = existing.id;
          poNumber = existing.po_number || "PO";
          if (!(existing.notes || "").includes(`WO${workOrder.wo_number}`)) {
            await supabase
              .from("purchase_orders")
              .update({ notes: [existing.notes, jobNote].filter(Boolean).join("\n") })
              .eq("id", existing.id);
          }
        } else {
          const { data: created, error: createErr } = await supabase
            .from("purchase_orders")
            .insert({
              supplier_id: supplierId,
              status: "Draft",
              delivery_address: workOrder.address || null,
              notes: jobNote,
            })
            .select("id, po_number")
            .single();
          if (createErr || !created) throw new Error(createErr?.message || "Couldn't create the purchase order.");
          poId = created.id;
          poNumber = created.po_number || "PO";
          logAudit(supabase, {
            eventType: "create",
            entityType: "purchase_order",
            entityId: created.id,
            entityLabel: poNumber,
            details: `Drafted from picking slip WO${workOrder.wo_number}`,
          });
        }
      }

      // Same part + same job already on this PO: update the quantity instead of adding a second line.
      const { data: sameLine } = await supabase
        .from("purchase_order_lines")
        .select("id")
        .eq("purchase_order_id", poId)
        .eq("part_id", l.part_id)
        .eq("work_order_id", workOrder.id)
        .limit(1);
      if (sameLine && sameLine.length > 0) {
        const { error: updErr } = await supabase
          .from("purchase_order_lines")
          .update({ qty_pks: shortfall })
          .eq("id", sameLine[0].id);
        if (updErr) throw new Error(updErr.message);
      } else {
        const { error: insErr } = await supabase.from("purchase_order_lines").insert({
          purchase_order_id: poId,
          part_id: l.part_id,
          work_order_id: workOrder.id,
          qty_multi: 0,
          qty_pks: shortfall,
          received_multi: 0,
          received_pks: 0,
          unit_cost: cost,
        });
        if (insErr) {
          throw new Error(
            insErr.message.includes("work_order_id") ? "Couldn't save the line — run migration 0029 in Supabase first." : insErr.message
          );
        }
      }
      setDrafts((d) => ({ ...d, [l.part_id]: { poId: poId!, poNumber, qty: shortfall } }));
      setOrderMsg({ poId: poId!, text: `Added ${fmtPacks(shortfall)} of ${l.parts.name} to draft ${poNumber}.` });
    } catch (e: any) {
      setError(e?.message || "Couldn't add to a purchase order.");
    } finally {
      setBusyId(null);
    }
  }

  const returnStock = (l: Line) => {
    const multi = Math.round(Number(retMulti[l.id] || 0)) || 0;
    const pks = Math.round(Number(retPks[l.id] || 0)) || 0;
    if (multi <= 0 && pks <= 0) {
      setError("Enter how many multis and/or packs came back.");
      return;
    }
    return run(l.id, `Returned ${fmtSplit(multi, pks)} to stock`, async () => {
      const r = await supabase.rpc("return_wo_line", { p_line_id: l.id, p_multi: multi, p_pks: pks });
      if (!r.error) {
        setRetMulti((prev) => ({ ...prev, [l.id]: "" }));
        setRetPks((prev) => ({ ...prev, [l.id]: "" }));
      }
      return r;
    });
  };
  const unreturn = (l: Line) =>
    run(l.id, "Undid return", async () => await supabase.rpc("unreturn_wo_line", { p_line_id: l.id }));
  const pick = (l: Line) => {
    const multi = Math.round(Number(pickMulti[l.id] || 0)) || 0;
    const pks = Math.round(Number(pickPks[l.id] || 0)) || 0;
    if (multi <= 0 && pks <= 0) {
      setError("Enter how many multis and/or packs you're picking.");
      return;
    }
    return run(l.id, `Picked ${fmtSplit(multi, pks)}`, async () =>
      await supabase.rpc("pick_wo_line", { p_line_id: l.id, p_multi: multi, p_pks: pks })
    );
  };

  const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  const costRows = lines.map((l) => {
    const ppm = Number(l.parts.pack_per_multi) || 0;
    const cost = Number(l.parts.pack_cost_ex_gst) || 0;
    const pickedPacks = (Number(l.multi_picked) || 0) * ppm + (Number(l.packs_picked) || 0);
    const returnedPacks = (Number(l.multi_returned) || 0) * ppm + (Number(l.packs_returned) || 0);
    return {
      picked: l.picked,
      quoted: packsNeeded(Number(l.qty) || 0, Number(l.parts.coverage_m2) || 0) * cost,
      pickedCost: l.picked ? pickedPacks * cost : 0,
      returnedCost: l.picked ? returnedPacks * cost : 0,
    };
  });
  const quotedCost = costRows.reduce((s, r) => s + r.quoted, 0);
  const pickedCost = costRows.reduce((s, r) => s + r.pickedCost, 0);
  const returnedCost = costRows.reduce((s, r) => s + r.returnedCost, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/work-orders/${workOrder.id}`} className="text-sm text-[var(--muted)] hover:underline">
          &larr; Work order WO{workOrder.wo_number}
        </Link>
        <Link
          href={`/dashboard/work-orders/${workOrder.id}/picking-slip/print`}
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

      <label className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium">
        Delivery date
        <input
          type="date"
          value={deliveryDate}
          onChange={(e) => saveDeliveryDate(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-normal"
        />
        <span className="text-xs font-normal text-[var(--muted)]">
          {dateStatus === "saving" ? "Saving..." : dateStatus === "saved" ? "Saved — shows on the printed picking slip" : "Shows on the printed picking slip"}
        </span>
      </label>

      {orderMsg && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">
          <span>{orderMsg.text}</span>
          <Link href={`/dashboard/purchase-orders/${orderMsg.poId}`} className="font-medium underline">
            Open the draft PO
          </Link>
        </div>
      )}
      {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      {lines.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)]">
          This work order has no material (product) lines to pick — only labour lines.
        </div>
      )}

      {costRows.some((r) => r.picked) && (
        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Real material cost (ex GST)</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-[var(--muted)]">Quoted</div>
              <div className="text-lg font-semibold tabular-nums">{money(quotedCost)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Picked</div>
              <div className="text-lg font-semibold tabular-nums">{money(pickedCost)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Returned to stock</div>
              <div className="text-lg font-semibold tabular-nums">− {money(returnedCost)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Real cost of the job</div>
              <div className="text-lg font-semibold tabular-nums text-accent">{money(pickedCost - returnedCost)}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Real cost = packs picked minus packs returned, at each item&apos;s pack cost. Enter what came back in the “Back” boxes
            against each picked line.
          </p>
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
                    {status === "picked" && (l.multi_returned > 0 || l.packs_returned > 0) && (
                      <div className="mt-1 text-xs text-[#1f6b35]">
                        Returned {fmtSplit(l.multi_returned, l.packs_returned)}
                        {l.returned_at ? ` · ${fmtDateTime(l.returned_at)}` : ""}
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
                      {status === "allocated" && (
                        <>
                          <div className="flex items-end gap-1.5">
                            <label className="flex flex-col items-end text-[10px] text-[var(--muted)]">
                              Multi
                              <input
                                type="number"
                                step="1"
                                min="0"
                                placeholder="0"
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
                                placeholder="0"
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
                      )}
                      {status === "picked" && (
                        <>
                          <div className="flex items-end gap-1.5">
                            <label className="flex flex-col items-end text-[10px] text-[var(--muted)]">
                              Back: Multi
                              <input
                                type="number"
                                step="1"
                                min="0"
                                placeholder="0"
                                value={retMulti[l.id] ?? ""}
                                onChange={(e) => setRetMulti((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                className="w-14 rounded-lg border border-[var(--border)] px-2 py-1.5 text-right text-xs"
                              />
                            </label>
                            <label className="flex flex-col items-end text-[10px] text-[var(--muted)]">
                              Pks
                              <input
                                type="number"
                                step="1"
                                min="0"
                                placeholder="0"
                                value={retPks[l.id] ?? ""}
                                onChange={(e) => setRetPks((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                className="w-14 rounded-lg border border-[var(--border)] px-2 py-1.5 text-right text-xs"
                              />
                            </label>
                            <button
                              onClick={() => returnStock(l)}
                              disabled={busy}
                              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-60"
                            >
                              Return to stock
                            </button>
                          </div>
                          {(l.multi_returned > 0 || l.packs_returned > 0) && (
                            <button onClick={() => unreturn(l)} disabled={busy} className="text-xs text-[var(--muted)] hover:underline">
                              Undo return
                            </button>
                          )}
                          <button onClick={() => unpick(l)} disabled={busy} className="text-xs text-[var(--muted)] hover:underline">
                            Undo pick
                          </button>
                        </>
                      )}
                      {shortfall > 0 && status !== "picked" && (
                        <>
                          <button
                            onClick={() => orderShortfall(l, shortfall)}
                            disabled={busy}
                            className="text-xs font-medium text-red-700 hover:underline disabled:opacity-60"
                          >
                            {drafts[l.part_id]
                              ? drafts[l.part_id].qty === shortfall
                                ? `On draft ${drafts[l.part_id].poNumber} · ${fmtPacks(shortfall)}`
                                : `Update draft ${drafts[l.part_id].poNumber} to ${fmtPacks(shortfall)}`
                              : `Order shortfall (${fmtPacks(shortfall)})`}
                          </button>
                          {drafts[l.part_id] && (
                            <Link href={`/dashboard/purchase-orders/${drafts[l.part_id].poId}`} className="text-xs text-[var(--muted)] hover:underline">
                              Open draft {drafts[l.part_id].poNumber}
                            </Link>
                          )}
                        </>
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
