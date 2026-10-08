"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { packsNeeded } from "@/lib/picking";

type Job = { id: string; woNumber: string; customer: string; address: string };
type WoLine = { id: string; qty: number; note: string | null; part_id: string | null; picked: boolean };
type Part = {
  id: string;
  code: string | null;
  name: string;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  supplier_id: string | null;
  stock_on_hand: number;
  is_stock_item: boolean | null;
};
type Supplier = { id: string; name: string };
type Reserved = { work_order_id: string; part_id: string; qty: number };
type Draft = { id: string; po_number: string | null; supplier_id: string | null; delivery_date: string | null };

type Selected = Job & { lines: WoLine[] };

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function WoPurchaseOrder({
  current,
  currentLines,
  others,
  parts,
  suppliers,
  reserved,
  drafts,
}: {
  current: Job;
  currentLines: WoLine[];
  others: Job[];
  parts: Part[];
  suppliers: Supplier[];
  reserved: Reserved[];
  drafts: Draft[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);

  const [selected, setSelected] = useState<Selected[]>([{ ...current, lines: currentLines }]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Everything still needed from stock, worked out job by job. Stock on hand is shared out in order, and
  // anything other jobs (not on this PO) have already reserved is taken off first, so two jobs on one PO
  // don't both count the same packs as available.
  const rows = useMemo(() => {
    const selectedIds = new Set(selected.map((s) => s.id));
    const pool: Record<string, number> = {};
    for (const p of parts) pool[p.id] = Number(p.stock_on_hand) || 0;
    for (const r of reserved) {
      if (selectedIds.has(r.work_order_id)) continue;
      const part = partById[r.part_id];
      if (!part) continue;
      pool[r.part_id] = (pool[r.part_id] ?? 0) - packsNeeded(Number(r.qty) || 0, Number(part.coverage_m2) || 0);
    }
    const out: {
      key: string;
      woId: string;
      woNumber: string;
      part: Part;
      note: string | null;
      needed: number;
      available: number;
      shortfall: number;
    }[] = [];
    for (const s of selected) {
      for (const l of s.lines) {
        if (!l.part_id || l.picked) continue;
        const part = partById[l.part_id];
        if (!part || part.is_stock_item === false) continue;
        const needed = packsNeeded(Number(l.qty) || 0, Number(part.coverage_m2) || 0);
        const avail = Math.max(0, pool[part.id] ?? 0);
        const take = Math.min(needed, avail);
        pool[part.id] = (pool[part.id] ?? 0) - take;
        out.push({
          key: l.id,
          woId: s.id,
          woNumber: s.woNumber,
          part,
          note: l.note,
          needed,
          available: avail,
          shortfall: needed - take,
        });
      }
    }
    return out;
  }, [selected, parts, partById, reserved]);

  // Default supplier: whoever has the most shortfall lines on the jobs chosen so far.
  const suggestedSupplier = useMemo(() => {
    const count: Record<string, number> = {};
    for (const r of rows) {
      if (r.shortfall > 0 && r.part.supplier_id) count[r.part.supplier_id] = (count[r.part.supplier_id] || 0) + 1;
    }
    const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : "";
  }, [rows]);

  const [supplierChoice, setSupplierChoice] = useState<string | null>(null);
  const supplierId = supplierChoice ?? suggestedSupplier;

  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
  const supplierRows = rows.filter((r) => r.part.supplier_id === supplierId);
  const otherSupplierRows = rows.filter((r) => r.shortfall > 0 && r.part.supplier_id !== supplierId);
  const qtyFor = (r: (typeof rows)[number]) => {
    const raw = qtyEdits[r.key];
    return raw === undefined ? r.shortfall : Math.max(0, Math.round(Number(raw) || 0));
  };
  const orderLines = supplierRows.filter((r) => qtyFor(r) > 0);
  const subtotal = orderLines.reduce((s, r) => s + qtyFor(r) * (Number(r.part.pack_cost_ex_gst) || 0), 0);

  const supplierDrafts = drafts.filter((d) => d.supplier_id === supplierId);
  const [target, setTarget] = useState<string>("new");
  const targetId = target !== "new" && supplierDrafts.some((d) => d.id === target) ? target : "new";

  const [form, setForm] = useState({
    delivery_date: "",
    delivery_time: "",
    delivery_address: current.address,
    site_contact_name: "",
    site_contact_phone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobList = selected.map((s) => s.woNumber).join(", ");
  const autoNote = `For work order${selected.length > 1 ? "s" : ""} ${jobList}${
    selected.length === 1 && current.customer ? ` — ${current.customer}` : ""
  }`;

  async function addJob(id: string) {
    const job = others.find((o) => o.id === id);
    if (!job) return;
    setAdding(true);
    setAddError(null);
    const { data, error: err } = await supabase
      .from("work_order_lines")
      .select("id, qty, note, part_id, picked")
      .eq("work_order_id", id)
      .order("sort_order");
    setAdding(false);
    if (err) {
      setAddError(err.message);
      return;
    }
    setSelected((prev) => [...prev, { ...job, lines: (data ?? []) as WoLine[] }]);
  }

  function removeJob(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }

  async function create() {
    if (!supplierId) {
      setError("Choose a supplier first.");
      return;
    }
    if (orderLines.length === 0) {
      setError("Nothing to order — enter a quantity on at least one line.");
      return;
    }
    setSaving(true);
    setError(null);

    const noteText = [autoNote, form.notes.trim()].filter(Boolean).join("\n");
    let poId = targetId;
    let poNumber = drafts.find((d) => d.id === targetId)?.po_number ?? "";

    if (targetId === "new") {
      const { data, error: insertErr } = await supabase
        .from("purchase_orders")
        .insert({
          supplier_id: supplierId,
          status: "Draft",
          order_date: new Date().toISOString().slice(0, 10),
          delivery_address: form.delivery_address || null,
          site_contact_name: form.site_contact_name || null,
          site_contact_phone: form.site_contact_phone || null,
          delivery_date: form.delivery_date || null,
          delivery_time: form.delivery_time || null,
          notes: noteText || null,
        })
        .select()
        .single();
      if (insertErr || !data) {
        setError(insertErr?.message || "Couldn't create the purchase order.");
        setSaving(false);
        return;
      }
      poId = data.id;
      poNumber = data.po_number || "";
    } else {
      // Adding to a draft that already exists: keep its delivery details, and add these jobs to its notes.
      const { data: existing } = await supabase.from("purchase_orders").select("notes").eq("id", targetId).single();
      const merged = [existing?.notes, noteText].filter(Boolean).join("\n");
      const { error: updErr } = await supabase.from("purchase_orders").update({ notes: merged || null }).eq("id", targetId);
      if (updErr) {
        setError(updErr.message);
        setSaving(false);
        return;
      }
    }

    const rowsToInsert = orderLines.map((r) => ({
      purchase_order_id: poId,
      part_id: r.part.id,
      work_order_id: r.woId,
      qty_multi: 0,
      qty_pks: qtyFor(r),
      received_multi: 0,
      received_pks: 0,
      unit_cost: Number(r.part.pack_cost_ex_gst) || 0,
    }));
    const { error: linesErr } = await supabase.from("purchase_order_lines").insert(rowsToInsert);
    if (linesErr) {
      setSaving(false);
      setError(
        linesErr.message.includes("work_order_id")
          ? "Couldn't save the lines — run migration 0029 in Supabase first, then try again."
          : linesErr.message
      );
      // A brand-new PO with no lines would just be clutter, so take it back out.
      if (targetId === "new") await supabase.from("purchase_orders").delete().eq("id", poId);
      return;
    }

    logAudit(supabase, {
      eventType: targetId === "new" ? "create" : "update",
      entityType: "purchase_order",
      entityId: poId,
      entityLabel: poNumber || "Purchase order",
      details: `From work order${selected.length > 1 ? "s" : ""} ${jobList}`,
    });
    router.push(`/dashboard/purchase-orders/${poId}`);
    router.refresh();
  }

  const availableToAdd = others.filter((o) => !selected.some((s) => s.id === o.id));

  return (
    <div>
      <Link href={`/dashboard/work-orders/${current.id}`} className="text-sm text-[var(--muted)] hover:underline">
        &larr; Work order {current.woNumber}
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Draft purchase order</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Starts from what this job is short of. Add another work order if the same delivery covers more than one job.
      </p>

      {/* Jobs on this PO */}
      <div className="mt-5 rounded-xl border border-[var(--border)] p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Jobs on this PO</h2>
        <div className="mt-2 flex flex-col gap-2">
          {selected.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f2f0ec] px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-semibold">{s.woNumber}</span>
                {s.customer && <span> — {s.customer}</span>}
                {s.address && <span className="text-[var(--muted)]"> · {s.address}</span>}
              </div>
              {s.id !== current.id && (
                <button onClick={() => removeJob(s.id)} className="shrink-0 text-xs text-[var(--muted)] hover:underline">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Add another work order</span>
            <select
              value=""
              disabled={adding || availableToAdd.length === 0}
              onChange={(e) => {
                if (e.target.value) addJob(e.target.value);
              }}
              className="max-w-full rounded-lg border border-[var(--border)] px-3 py-1.5"
            >
              <option value="">{adding ? "Adding..." : availableToAdd.length === 0 ? "No other work orders" : "Select a job..."}</option>
              {availableToAdd.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.woNumber} — {o.customer || "—"}
                  {o.address ? ` — ${o.address}` : ""}
                </option>
              ))}
            </select>
          </label>
        </>
        {addError && <p className="mt-2 text-sm text-red-700">{addError}</p>}
      </div>

      {/* Supplier + target */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Supplier
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierChoice(e.target.value);
              setTarget("new");
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2"
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
          Put these lines on
          <select
            value={targetId}
            onChange={(e) => setTarget(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2"
          >
            <option value="new">A new draft PO</option>
            {supplierDrafts.map((d) => (
              <option key={d.id} value={d.id}>
                Add to draft {d.po_number || "PO"}
                {d.delivery_date ? ` (delivery ${d.delivery_date})` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Lines */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Needed (pks)</th>
              <th className="px-3 py-2 text-right">In stock</th>
              <th className="px-3 py-2 text-right">Order (pks)</th>
              <th className="px-3 py-2 text-right">Unit cost</th>
              <th className="px-3 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {supplierRows.map((r) => {
              const qty = qtyFor(r);
              return (
                <tr key={r.key} className={`border-t border-[var(--border)] ${qty === 0 ? "text-[var(--muted)]" : ""}`}>
                  <td className="px-3 py-2">{r.woNumber}</td>
                  <td className="px-3 py-2">
                    {r.part.code ? `${r.part.code} — ` : ""}
                    {r.part.name}
                    {r.note && <div className="text-xs text-[var(--muted)]">{r.note}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">{r.needed}</td>
                  <td className="px-3 py-2 text-right">{Math.round(r.available * 100) / 100}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={qtyEdits[r.key] ?? String(r.shortfall)}
                      onChange={(e) => setQtyEdits((prev) => ({ ...prev, [r.key]: e.target.value }))}
                      className="w-20 rounded-lg border border-[var(--border)] px-2 py-1.5 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(Number(r.part.pack_cost_ex_gst) || 0)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {fmtCurrency(qty * (Number(r.part.pack_cost_ex_gst) || 0))}
                  </td>
                </tr>
              );
            })}
            {supplierRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                  {supplierId
                    ? "None of the products on these jobs come from this supplier."
                    : "Choose a supplier to see the products to order."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {otherSupplierRows.length > 0 && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Also short, from other suppliers (draft a separate PO for each):{" "}
          {Array.from(new Set(otherSupplierRows.map((r) => r.part.name))).join(", ")}.
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--muted)]">
        Order quantities start at what&apos;s short after stock on hand and other jobs&apos; reservations. Change any number, or set it
        to 0 to leave a line off.
      </p>

      {/* Delivery */}
      {targetId === "new" && (
        <div className="mt-5 rounded-xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Delivery</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Delivery date
              <input
                type="date"
                value={form.delivery_date}
                onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                className="rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Delivery time
              <input
                type="time"
                value={form.delivery_time}
                onChange={(e) => setForm({ ...form, delivery_time: e.target.value })}
                className="rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Delivery address
              <input
                value={form.delivery_address}
                onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                className="rounded-lg border border-[var(--border)] px-3 py-2"
              />
              {selected.length > 1 && (
                <span className="text-xs text-[var(--muted)]">
                  Starts as {current.woNumber}&apos;s address. Change it if the delivery is going somewhere else.
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Site contact
              <input
                value={form.site_contact_name}
                onChange={(e) => setForm({ ...form, site_contact_name: e.target.value })}
                className="rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Contact phone
              <input
                value={form.site_contact_phone}
                onChange={(e) => setForm({ ...form, site_contact_phone: e.target.value })}
                className="rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
          </div>
        </div>
      )}

      <label className="mt-4 flex flex-col gap-1 text-sm">
        Notes
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Anything extra for the supplier"
          className="rounded-lg border border-[var(--border)] px-3 py-2"
        />
        <span className="text-xs text-[var(--muted)]">&ldquo;{autoNote}&rdquo; is added automatically.</span>
      </label>

      {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          onClick={create}
          disabled={saving}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : targetId === "new" ? "Create draft PO" : "Add to draft PO"}
        </button>
        <span className="text-sm text-[var(--muted)]">
          {orderLines.length} line{orderLines.length === 1 ? "" : "s"} · {fmtCurrency(subtotal)} ex GST
        </span>
        <span className="text-xs text-[var(--muted)]">It stays a Draft — nothing is sent to the supplier.</span>
      </div>
    </div>
  );
}
