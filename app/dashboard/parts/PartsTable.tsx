"use client";

import { useMemo, useState } from "react";
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

const emptyForm = {
  name: "",
  supplier_id: "",
  coverage_m2: 0,
  pack_cost_ex_gst: 0,
  installer_rate_per_m2: 0,
  supply_charge_per_pack: 0,
  supply_install_rate_per_m2: 0,
  pack_per_multi: 0,
  multi: 0,
  pks: 0,
  is_stock_item: true,
};

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
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Part | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? "—";

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(p: Part) {
    setEditing(p);
    setForm({
      name: p.name,
      supplier_id: p.supplier_id || "",
      coverage_m2: p.coverage_m2,
      pack_cost_ex_gst: p.pack_cost_ex_gst,
      installer_rate_per_m2: p.installer_rate_per_m2,
      supply_charge_per_pack: p.supply_charge_per_pack,
      supply_install_rate_per_m2: p.supply_install_rate_per_m2,
      pack_per_multi: p.pack_per_multi,
      multi: p.multi,
      pks: p.pks,
      is_stock_item: p.is_stock_item,
    });
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    const payload = { ...form, supplier_id: form.supplier_id || null };
    if (editing) {
      const { data, error } = await supabase
        .from("parts")
        .update(payload)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setParts((prev) => prev.map((p) => (p.id === editing.id ? (data as Part) : p)));
        setModalOpen(false);
      } else if (error) alert(error.message);
    } else {
      const { data, error } = await supabase.from("parts").insert(payload).select().single();
      if (!error && data) {
        setParts((prev) => [data as Part, ...prev]);
        setModalOpen(false);
      } else if (error) alert(error.message);
    }
    setSaving(false);
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

  const visible = useMemo(() => {
    return parts
      .filter((p) => p.archived === showArchived)
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      // stock items first, non-stock items (Retro Fit, delivery, etc.) at the bottom
      .sort((a, b) => Number(b.is_stock_item) - Number(a.is_stock_item) || a.name.localeCompare(b.name));
  }, [parts, showArchived, search]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <button onClick={openNew} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Add part
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <input
          placeholder="Search parts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <button onClick={() => setShowArchived((v) => !v)} className="text-sm text-[var(--muted)] underline">
          {showArchived ? "View active" : "View archived"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">Stock on hand</th>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Coverage m²/pack</th>
              <th className="px-4 py-2">Pack cost</th>
              <th className="px-4 py-2">Supply only /pack</th>
              <th className="px-4 py-2">Supply+install /m²</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={`border-t border-[var(--border)] ${!p.is_stock_item ? "opacity-60" : ""}`}>
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2 font-mono">{p.stock_on_hand}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{supplierName(p.supplier_id)}</td>
                <td className="px-4 py-2">{p.coverage_m2}</td>
                <td className="px-4 py-2">${p.pack_cost_ex_gst.toFixed(2)}</td>
                <td className="px-4 py-2">${p.supply_charge_per_pack.toFixed(2)}</td>
                <td className="px-4 py-2">${p.supply_install_rate_per_m2.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(p)} className="text-accent hover:underline">
                    Edit
                  </button>
                  <button onClick={() => toggleArchive(p)} className="ml-3 text-[var(--muted)] hover:underline">
                    {p.archived ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
                  No parts found.
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
              <h2 className="text-lg font-bold">{editing ? "Edit part" : "Add part"}</h2>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <label className="flex flex-col gap-1 text-sm">
                Name
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

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_stock_item}
                  onChange={(e) => setForm({ ...form, is_stock_item: e.target.checked })}
                />
                Stock item (uncheck for non-stock items like Retro Fit / delivery — these sort to the
                bottom of the list)
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
              <button onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
