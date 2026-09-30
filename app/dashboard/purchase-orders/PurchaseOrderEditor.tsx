"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Supplier = { id: string; name: string };

type Part = {
  id: string;
  name: string;
  pack_per_multi: number;
  pack_cost_ex_gst: number;
  supplier_id: string | null;
};

type PurchaseOrder = {
  id: string;
  po_number: string | null;
  supplier_id: string | null;
  status: "Draft" | "Ordered" | "Received";
  order_date: string | null;
  delivery_address: string | null;
  site_contact_name: string | null;
  site_contact_phone: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  notes: string | null;
  archived: boolean;
};

type Line = {
  id?: string;
  part_id: string | null;
  // Ordering is always in loose packs — we never order by the multi-pack. qty_multi is kept
  // (always 0) purely so the database row shape matches purchase_order_lines.
  qty_multi: number;
  qty_pks: number;
  // Receiving is different: stock can turn up as full multi-packs, loose packs, or both.
  received_multi: number;
  received_pks: number;
  unit_cost: number | null;
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function PurchaseOrderEditor({
  purchaseOrder,
  lines,
  suppliers,
  parts,
}: {
  purchaseOrder: PurchaseOrder | null;
  lines: Line[];
  suppliers: Supplier[];
  parts: Part[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const isNew = !purchaseOrder;
  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);

  const [form, setForm] = useState({
    supplier_id: purchaseOrder?.supplier_id || "",
    status: purchaseOrder?.status || "Draft",
    order_date: purchaseOrder?.order_date || new Date().toISOString().slice(0, 10),
    delivery_address: purchaseOrder?.delivery_address || "",
    site_contact_name: purchaseOrder?.site_contact_name || "",
    site_contact_phone: purchaseOrder?.site_contact_phone || "",
    delivery_date: purchaseOrder?.delivery_date || "",
    delivery_time: purchaseOrder?.delivery_time || "",
    notes: purchaseOrder?.notes || "",
  });

  // Only the selected supplier's own products should be pickable on a line item — with no
  // supplier chosen yet, every product is available so the form isn't stuck unusable.
  const availableParts = useMemo(
    () => (form.supplier_id ? parts.filter((p) => p.supplier_id === form.supplier_id) : parts),
    [parts, form.supplier_id]
  );

  const [lineItems, setLineItems] = useState<Line[]>(
    lines.length > 0 ? lines.map((l) => ({ ...l })) : []
  );

  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    const first = availableParts[0];
    setLineItems((prev) => [
      ...prev,
      {
        part_id: first?.id || null,
        qty_multi: 0,
        qty_pks: 0,
        received_multi: 0,
        received_pks: 0,
        unit_cost: first?.pack_cost_ex_gst || 0,
      },
    ]);
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLineItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function lineTotal(l: Line) {
    // Ordered quantity is always in packs, so the line total is just packs × unit cost.
    return (Number(l.qty_pks) || 0) * (Number(l.unit_cost) || 0);
  }

  const subtotal = lineItems.reduce((s, l) => s + lineTotal(l), 0);
  const gst = subtotal * 0.1;
  const grandTotal = subtotal + gst;

  async function save() {
    setSaving(true);
    setError(null);

    // po_number is auto-assigned by the database (a sequence, like "PO1001") — it's never
    // sent here, so a new row gets its default and an existing one keeps whatever it has.
    const payload = {
      supplier_id: form.supplier_id || null,
      status: form.status,
      order_date: form.order_date || null,
      delivery_address: form.delivery_address || null,
      site_contact_name: form.site_contact_name || null,
      site_contact_phone: form.site_contact_phone || null,
      delivery_date: form.delivery_date || null,
      delivery_time: form.delivery_time || null,
      notes: form.notes || null,
    };

    let poId = purchaseOrder?.id;

    if (isNew) {
      const { data, error: insertErr } = await supabase.from("purchase_orders").insert(payload).select().single();
      if (insertErr || !data) {
        setError(insertErr?.message || "Failed to create purchase order.");
        setSaving(false);
        return;
      }
      poId = data.id;
    } else {
      const { error: updateErr } = await supabase.from("purchase_orders").update(payload).eq("id", poId);
      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }
      await supabase.from("purchase_order_lines").delete().eq("purchase_order_id", poId);
    }

    const rowsToInsert = lineItems
      .filter((l) => l.part_id)
      .map((l) => ({
        purchase_order_id: poId,
        part_id: l.part_id,
        qty_multi: Number(l.qty_multi) || 0,
        qty_pks: Number(l.qty_pks) || 0,
        received_multi: Number(l.received_multi) || 0,
        received_pks: Number(l.received_pks) || 0,
        unit_cost: Number(l.unit_cost) || 0,
      }));

    if (rowsToInsert.length > 0) {
      const { error: linesErr } = await supabase.from("purchase_order_lines").insert(rowsToInsert);
      if (linesErr) {
        setError(linesErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push(`/dashboard/purchase-orders/${poId}`);
    router.refresh();
  }

  async function applyReceivedStock() {
    if (!purchaseOrder) return;
    if (
      !confirm(
        "This adds the Received multi/pks quantities below into Inventory stock on hand, and marks this purchase order as Received. Only do this once the goods have actually arrived. Continue?"
      )
    )
      return;

    setApplying(true);
    for (const l of lineItems) {
      if (!l.part_id) continue;
      const part = partById[l.part_id];
      if (!part) continue;
      const receivedMulti = Number(l.received_multi) || 0;
      const receivedPks = Number(l.received_pks) || 0;
      if (receivedMulti === 0 && receivedPks === 0) continue;

      const { data: current } = await supabase.from("parts").select("multi, pks").eq("id", l.part_id).single();
      if (current) {
        await supabase
          .from("parts")
          .update({
            multi: (current.multi || 0) + receivedMulti,
            pks: (current.pks || 0) + receivedPks,
          })
          .eq("id", l.part_id);
      }
    }

    await supabase.from("purchase_orders").update({ status: "Received" }).eq("id", purchaseOrder.id);
    setApplying(false);
    router.refresh();
  }

  async function toggleArchive() {
    if (!purchaseOrder) return;
    if (!purchaseOrder.archived && !confirm(`Archive ${purchaseOrder.po_number || "this purchase order"}?`)) return;
    await supabase.from("purchase_orders").update({ archived: !purchaseOrder.archived }).eq("id", purchaseOrder.id);
    router.push("/dashboard/purchase-orders");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/purchase-orders" className="text-sm text-[var(--muted)] hover:underline">
            &larr; Purchase orders
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {isNew ? "New purchase order" : purchaseOrder!.po_number || "Purchase order"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && (
            <button onClick={toggleArchive} className="text-sm text-[var(--muted)] hover:underline">
              {purchaseOrder!.archived ? "Restore" : "Archive"}
            </button>
          )}
          {!isNew && (
            <Link
              href={`/dashboard/purchase-orders/${purchaseOrder!.id}/print`}
              target="_blank"
              className="text-sm text-[var(--muted)] hover:underline"
            >
              Print preview
            </Link>
          )}
          {!isNew && purchaseOrder!.status !== "Received" && (
            <button
              onClick={applyReceivedStock}
              disabled={applying}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-60"
            >
              {applying ? "Applying..." : "Apply received stock to inventory"}
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save purchase order"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-[var(--border)] p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Supplier
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.supplier_id}
            onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
          >
            <option value="">Select supplier...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as PurchaseOrder["status"] })}
          >
            {["Draft", "Ordered", "Received"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          P/O number
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[#f2f0ec] px-3 py-2 text-[var(--muted)]">
            {isNew ? "Assigned automatically on save" : purchaseOrder!.po_number || "—"}
          </div>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Order date
          <input
            type="date"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.order_date}
            onChange={(e) => setForm({ ...form, order_date: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Deliver to (address)
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.delivery_address}
            onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
            placeholder="Site address the order should be delivered to"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Site contact name
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.site_contact_name}
            onChange={(e) => setForm({ ...form, site_contact_name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Site contact phone
          <input
            type="tel"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.site_contact_phone}
            onChange={(e) => setForm({ ...form, site_contact_phone: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Delivery date
          <input
            type="date"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.delivery_date}
            onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Delivery time
          <input
            type="time"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.delivery_time}
            onChange={(e) => setForm({ ...form, delivery_time: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Notes
          <textarea
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Line items</h2>
          <button onClick={addLine} className="text-sm text-accent hover:underline">
            + Add line
          </button>
        </div>

        <p className="mt-1 text-xs text-[var(--muted)]">
          You order by the pack. When stock arrives, split what actually turned up between full
          multi-packs and loose packs — matching how stock is counted in Inventory.
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Ordered (pks)</th>
                <th className="px-3 py-2 text-right">Unit cost</th>
                <th className="px-3 py-2 text-right">Line total</th>
                <th className="px-3 py-2 text-right">Received multis</th>
                <th className="px-3 py-2 text-right">Received pks</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((l, idx) => (
                <tr key={idx} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <select
                      className="rounded-lg border border-[var(--border)] px-2 py-1.5"
                      value={l.part_id || ""}
                      onChange={(e) =>
                        updateLine(idx, {
                          part_id: e.target.value,
                          unit_cost: partById[e.target.value]?.pack_cost_ex_gst ?? l.unit_cost,
                        })
                      }
                    >
                      <option value="">Select item...</option>
                      {availableParts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                      {l.part_id && !availableParts.some((p) => p.id === l.part_id) && partById[l.part_id] && (
                        <option value={l.part_id}>{partById[l.part_id].name} (different supplier)</option>
                      )}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="1"
                      className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-right"
                      value={l.qty_pks}
                      onChange={(e) => updateLine(idx, { qty_pks: Math.round(Number(e.target.value)) })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-right"
                      value={l.unit_cost ?? 0}
                      onChange={(e) => updateLine(idx, { unit_cost: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{fmtCurrency(lineTotal(l))}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="1"
                      className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-right"
                      value={l.received_multi}
                      onChange={(e) => updateLine(idx, { received_multi: Math.round(Number(e.target.value)) })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="1"
                      className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-right"
                      value={l.received_pks}
                      onChange={(e) => updateLine(idx, { received_pks: Math.round(Number(e.target.value)) })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => removeLine(idx)} className="text-[var(--muted)] hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                    No line items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[#f2f0ec] p-3 text-sm">
          <span className="text-[var(--muted)]">{lineItems.length} line item(s)</span>
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-3 text-[var(--muted)]">
              <span>Subtotal (ex GST)</span>
              <span className="text-[var(--text)]">{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center gap-3 text-[var(--muted)]">
              <span>GST (10%)</span>
              <span className="text-[var(--text)]">{fmtCurrency(gst)}</span>
            </div>
            <div className="mt-1 flex items-center gap-3 border-t border-[var(--border)] pt-1 font-semibold">
              <span>Total (inc GST)</span>
              <span>{fmtCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
