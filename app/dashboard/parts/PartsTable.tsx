"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Part = {
  id: string;
  name: string;
  supplier_id: string | null;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  installer_rate_per_m2: number;
  supply_charge_per_pack: number;
  supply_install_rate_per_m2: number;
  pack_per_multi: number;
  multi: number;
  pks: number;
  stock_on_hand: number;
  is_stock_item: boolean;
  archived: boolean;
};

type Supplier = { id: string; name: string };

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

const emptyForm = {
  name: "",
  supplier_id: "",
  coverage_m2: 1,
  pack_cost_ex_gst: 0,
  installer_rate_per_m2: 0,
  supply_charge_per_pack: 0,
  supply_install_rate_per_m2: 0,
  pack_per_multi: 0,
  multi: 0,
  pks: 0,
  is_stock_item: true,
};

// A cell that edits in place: click to focus, type, and it saves on blur — no modal round-trip.
function InlineCell({
  value,
  onCommit,
  type = "text",
  align = "left",
}: {
  value: string | number;
  onCommit: (v: string | number) => void;
  type?: "text" | "number";
  align?: "left" | "right";
}) {
  const [v, setV] = useState(String(value));

  useEffect(() => {
    setV(String(value));
  }, [value]);

  return (
    <input
      type={type}
      step={type === "number" ? "0.01" : undefined}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const parsed = type === "number" ? Number(v) || 0 : v;
        if (parsed !== value) onCommit(parsed);
      }}
      className={`w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-[var(--border)] focus:border-accent focus:bg-white focus:outline-none ${
        align === "right" ? "text-right" : "text-left"
      }`}
    />
  );
}

// A select that behaves the same way — commits immediately on change.
function InlineSelect({
  value,
  options,
  onCommit,
}: {
  value: string;
  options: { id: string; name: string }[];
  onCommit: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm hover:border-[var(--border)] focus:border-accent focus:bg-white focus:outline-none"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export default function PartsTable({
  initial,
  suppliers,
}: {
  initial: Part[];
  suppliers: Supplier[];
}) {
  const supabase = createClient();
  const [parts, setParts] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [hideNonStock, setHideNonStock] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const supplierById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  async function patch(p: Part, field: keyof Part, value: string | number | boolean) {
    const { data, error } = await supabase
      .from("parts")
      .update({ [field]: value })
      .eq("id", p.id)
      .select()
      .single();
    if (!error && data) {
      setParts((prev) => prev.map((x) => (x.id === p.id ? (data as Part) : x)));
    } else if (error) {
      alert(error.message);
    }
  }

  async function toggleArchive(p: Part) {
    if (!p.archived && !confirm(`Archive ${p.name}?`)) return;
    const { data, error } = await supabase
      .from("parts")
      .update({ archived: !p.archived })
      .eq("id", p.id)
      .select()
      .single();
    if (!error && data) {
      setParts((prev) => prev.map((x) => (x.id === p.id ? (data as Part) : x)));
    }
  }

  async function saveNew() {
    setSaving(true);
    const payload = { ...form, supplier_id: form.supplier_id || null };
    const { data, error } = await supabase.from("parts").insert(payload).select().single();
    if (!error && data) {
      setParts((prev) => [data as Part, ...prev]);
      setModalOpen(false);
      setForm(emptyForm);
    } else if (error) {
      alert(error.message);
    }
    setSaving(false);
  }

  const visible = useMemo(() => {
    return parts
      .filter((p) => p.archived === showArchived)
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      .filter((p) => !hideNonStock || p.is_stock_item)
      .sort((a, b) => Number(b.is_stock_item) - Number(a.is_stock_item) || a.name.localeCompare(b.name));
  }, [parts, showArchived, search, hideNonStock]);

  // Inventory value by supplier, for the KPI cards up top.
  const supplierTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of parts) {
      if (p.archived) continue;
      const key = p.supplier_id ? supplierById[p.supplier_id] || "Unassigned" : "Unassigned";
      totals[key] = (totals[key] || 0) + p.pack_cost_ex_gst * p.stock_on_hand;
    }
    return Object.entries(totals).filter(([, v]) => v > 0);
  }, [parts, supplierById]);
  const grandTotal = supplierTotals.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Click any cell to edit it directly.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Add item
        </button>
      </div>

      {/* KPI cards: total value + per-supplier value */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-[var(--border)] p-3">
          <div className="text-xs uppercase text-[var(--muted)]">Total inventory value</div>
          <div className="mt-1 text-lg font-bold">{fmtCurrency(grandTotal)}</div>
        </div>
        {supplierTotals.map(([supplier, value]) => (
          <div key={supplier} className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-xs uppercase text-[var(--muted)]">{supplier}</div>
            <div className="mt-1 text-lg font-bold">{fmtCurrency(value)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input type="checkbox" checked={hideNonStock} onChange={(e) => setHideNonStock(e.target.checked)} />
          Hide non-stock items
        </label>
        <button onClick={() => setShowArchived((v) => !v)} className="text-sm text-[var(--muted)] underline">
          {showArchived ? "View active" : "View archived"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[1300px] whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Stock on hand</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2 text-right">Coverage/pack</th>
              <th className="px-3 py-2 text-right">Pack cost ex</th>
              <th className="px-3 py-2 text-right">Installer rate/m²</th>
              <th className="px-3 py-2 text-right">Supply/pack</th>
              <th className="px-3 py-2 text-right">Pks</th>
              <th className="px-3 py-2 text-right">Multi</th>
              <th className="px-3 py-2 text-right">Pack per multi</th>
              <th className="px-3 py-2 text-right">Supply+install/m²</th>
              <th className="px-3 py-2 text-right">Inventory value</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.id}
                className={`border-t border-[var(--border)] hover:bg-black/[0.02] ${
                  !p.is_stock_item ? "opacity-60" : ""
                }`}
              >
                <td className="px-1 py-1">
                  <div className="flex items-center gap-1.5 px-2">
                    <InlineCell value={p.name} onCommit={(v) => patch(p, "name", v)} />
                    {!p.is_stock_item && (
                      <span className="shrink-0 rounded bg-[#f2f0ec] px-1.5 py-0.5 text-xs text-[var(--muted)]">
                        Non-stock
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1 text-right font-mono">{p.stock_on_hand}</td>
                <td className="px-1 py-1">
                  <InlineSelect
                    value={p.supplier_id || ""}
                    options={suppliers}
                    onCommit={(v) => patch(p, "supplier_id", v)}
                  />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.coverage_m2} onCommit={(v) => patch(p, "coverage_m2", v)} align="right" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.pack_cost_ex_gst} onCommit={(v) => patch(p, "pack_cost_ex_gst", v)} align="right" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.installer_rate_per_m2} onCommit={(v) => patch(p, "installer_rate_per_m2", v)} align="right" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.supply_charge_per_pack} onCommit={(v) => patch(p, "supply_charge_per_pack", v)} align="right" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.pks} onCommit={(v) => patch(p, "pks", v)} align="right" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.multi} onCommit={(v) => patch(p, "multi", v)} align="right" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.pack_per_multi} onCommit={(v) => patch(p, "pack_per_multi", v)} align="right" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell
                    type="number"
                    value={p.supply_install_rate_per_m2}
                    onCommit={(v) => patch(p, "supply_install_rate_per_m2", v)}
                    align="right"
                  />
                </td>
                <td className="px-3 py-1 text-right font-medium">
                  {fmtCurrency(p.pack_cost_ex_gst * p.stock_on_hand)}
                </td>
                <td className="px-3 py-1 text-right">
                  <button onClick={() => toggleArchive(p)} className="text-[var(--muted)] hover:underline">
                    {p.archived ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-[var(--muted)]">
                  No {showArchived ? "archived" : ""} parts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-6 py-4">
              <h2 className="text-lg font-bold">Add item</h2>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <label className="flex flex-col gap-1 text-sm">
                Item name
                <input
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  Supplier
                  <select
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.supplier_id}
                    onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  >
                    <option value="">—</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Coverage (m² per pack)
                  <input
                    type="number"
                    step="0.001"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.coverage_m2}
                    onChange={(e) => setForm({ ...form, coverage_m2: Number(e.target.value) })}
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_stock_item}
                  onChange={(e) => setForm({ ...form, is_stock_item: e.target.checked })}
                />
                Stock item — uncheck for non-stock items (Delivery, Retro Fit) that sit at the bottom of
                the list with no stock tracked
              </label>

              <p className="text-xs font-medium uppercase text-[var(--muted)]">Pricing</p>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  Pack cost (ex GST)
                  <input
                    type="number"
                    step="0.01"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.pack_cost_ex_gst}
                    onChange={(e) => setForm({ ...form, pack_cost_ex_gst: Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Installer rate ($/m²)
                  <input
                    type="number"
                    step="0.01"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.installer_rate_per_m2}
                    onChange={(e) => setForm({ ...form, installer_rate_per_m2: Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Supply only ($/pack)
                  <input
                    type="number"
                    step="0.01"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.supply_charge_per_pack}
                    onChange={(e) => setForm({ ...form, supply_charge_per_pack: Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Supply + install ($/m²)
                  <input
                    type="number"
                    step="0.01"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.supply_install_rate_per_m2}
                    onChange={(e) => setForm({ ...form, supply_install_rate_per_m2: Number(e.target.value) })}
                  />
                </label>
              </div>

              <p className="text-xs font-medium uppercase text-[var(--muted)]">Stock</p>
              <div className="grid grid-cols-3 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  Pack per multi
                  <input
                    type="number"
                    step="0.01"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.pack_per_multi}
                    onChange={(e) => setForm({ ...form, pack_per_multi: Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Multi
                  <input
                    type="number"
                    step="0.01"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.multi}
                    onChange={(e) => setForm({ ...form, multi: Number(e.target.value) })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Pks
                  <input
                    type="number"
                    step="0.01"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.pks}
                    onChange={(e) => setForm({ ...form, pks: Number(e.target.value) })}
                  />
                </label>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Stock on hand = pack per multi × multi + pks — calculated automatically after saving.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
              <button onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={saveNew}
                disabled={saving || !form.name}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
