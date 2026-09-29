"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
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

// CSV import — column headers (in order) and helpers for turning spreadsheet text into real values.
const CSV_COLUMNS = [
  "name",
  "supplier",
  "is_stock_item",
  "coverage_m2",
  "pack_cost_ex_gst",
  "installer_rate_per_m2",
  "supply_charge_per_pack",
  "supply_install_rate_per_m2",
  "pack_per_multi",
  "multi",
  "pks",
] as const;

const CSV_TEMPLATE_ROWS = [
  ["R2.5 Wall Batt", "Fletcher Insulation", "TRUE", "6.3", "42.50", "3.20", "9.90", "12.40", "1", "24", "0"],
  ["Ceiling Blanket R6.0", "CSR Bradford", "TRUE", "10.8", "65.00", "2.80", "8.50", "10.90", "1", "12", "0"],
  ["Delivery", "", "FALSE", "1", "0", "0", "0", "45.00", "0", "0", "0"],
];

function parseNum(v: string | undefined) {
  const n = parseFloat((v || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function parseIntish(v: string | undefined) {
  return Math.round(parseNum(v));
}
function parseBool(v: string | undefined, fallback = true) {
  const s = (v || "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return fallback;
}

function downloadCsvTemplate() {
  const csv = [CSV_COLUMNS.join(","), ...CSV_TEMPLATE_ROWS.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventory-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// A cell that edits in place: click to focus, type, and it saves on blur — no modal round-trip.
type Align = "left" | "right" | "center";

const JUSTIFY: Record<Align, string> = {
  left: "justify-start",
  right: "justify-end",
  center: "justify-center",
};
const TEXT_ALIGN: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function InlineCell({
  value,
  onCommit,
  type = "text",
  align = "left",
  prefix,
  integer = false,
}: {
  value: string | number;
  onCommit: (v: string | number) => void;
  type?: "text" | "number";
  align?: Align;
  prefix?: string;
  integer?: boolean;
}) {
  const [v, setV] = useState(String(value));

  useEffect(() => {
    setV(String(value));
  }, [value]);

  // Prefix and input sit side by side in a flex row (rather than the input filling the
  // whole cell), so "$" always stays snug against the digits, wherever the cell is aligned.
  return (
    <div className={`flex items-center gap-0.5 ${JUSTIFY[align]}`}>
      {prefix && <span className="text-[var(--muted)]">{prefix}</span>}
      <input
        type={type}
        step={type === "number" ? (integer ? "1" : "0.01") : undefined}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const parsed = type === "number" ? (integer ? Math.round(Number(v)) || 0 : Number(v) || 0) : v;
          if (parsed !== value) onCommit(parsed);
        }}
        className={`rounded border border-transparent bg-transparent px-1 py-1 text-sm hover:border-[var(--border)] focus:border-accent focus:bg-white focus:outline-none ${
          prefix ? "w-16" : "w-full"
        } ${TEXT_ALIGN[align]}`}
      />
    </div>
  );
}

const INVENTORY_COLS = [
  { key: "name", label: "Item", align: "left" as Align, width: 220 },
  { key: "stock", label: "Stock on hand", align: "center" as Align, width: 110 },
  { key: "supplier", label: "Supplier", align: "center" as Align, width: 140 },
  { key: "coverage", label: "Coverage/pack", align: "center" as Align, width: 110 },
  { key: "packCost", label: "Pack cost ex", align: "center" as Align, width: 110 },
  { key: "covCostM2", label: "Cov/Cost/m²", align: "center" as Align, width: 110 },
  { key: "installerRate", label: "Installer rate/m²", align: "center" as Align, width: 130 },
  { key: "supplyPack", label: "Supply/pack", align: "center" as Align, width: 110 },
  { key: "pks", label: "Pks", align: "center" as Align, width: 70 },
  { key: "multi", label: "Multi", align: "center" as Align, width: 70 },
  { key: "packPerMulti", label: "Pack per multi", align: "center" as Align, width: 120 },
  { key: "supplyInstall", label: "Supply+install/m²", align: "center" as Align, width: 140 },
  { key: "value", label: "Inventory value", align: "center" as Align, width: 130 },
  { key: "actions", label: "", align: "center" as Align, width: 90 },
];

const COL_WIDTHS_KEY = "coverage-inventory-col-widths";

// A column header that can be dragged wider/narrower from its right edge.
function ResizableTh({
  label,
  align,
  onResizeStart,
}: {
  label: string;
  align: Align;
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  return (
    <th className={`relative whitespace-normal break-words px-3 py-2 align-bottom leading-tight ${TEXT_ALIGN[align]}`}>
      {label}
      <span
        onMouseDown={onResizeStart}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/40"
      />
    </th>
  );
}

// A select that behaves the same way — commits immediately on change.
function InlineSelect({
  value,
  options,
  onCommit,
  align = "left",
}: {
  value: string;
  options: { id: string; name: string }[];
  onCommit: (v: string) => void;
  align?: Align;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      className={`w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm hover:border-[var(--border)] focus:border-accent focus:bg-white focus:outline-none ${TEXT_ALIGN[align]}`}
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
  const [supplierList, setSupplierList] = useState(suppliers);
  const [showArchived, setShowArchived] = useState(false);
  const [hideNonStock, setHideNonStock] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [colWidths, setColWidths] = useState(INVENTORY_COLS.map((c) => c.width));
  const resizingRef = useRef<{ idx: number; startX: number; startWidth: number } | null>(null);

  // Load any previously saved column widths for this browser, so the layout stays the way it was left.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COL_WIDTHS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === INVENTORY_COLS.length) {
          setColWidths(parsed);
        }
      }
    } catch {
      // no saved widths yet, or storage unavailable — fall back to defaults
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { idx, startX, startWidth } = resizingRef.current;
      const next = Math.max(50, startWidth + (e.clientX - startX));
      setColWidths((prev) => prev.map((w, i) => (i === idx ? next : w)));
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      setColWidths((prev) => {
        try {
          localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(prev));
        } catch {
          // ignore — persistence is a nice-to-have, not required for the table to work
        }
        return prev;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (idx: number) => (e: React.MouseEvent) => {
    resizingRef.current = { idx, startX: e.clientX, startWidth: colWidths[idx] };
  };

  const supplierById = useMemo(
    () => Object.fromEntries(supplierList.map((s) => [s.id, s.name])),
    [supplierList]
  );

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          const supplierMap = new Map(supplierList.map((s) => [s.name.trim().toLowerCase(), s.id]));
          const newSuppliers: Supplier[] = [];
          const toInsert: Omit<Part, "id" | "stock_on_hand" | "archived">[] = [];
          let skipped = 0;

          for (const row of rows) {
            const name = (row.name || "").trim();
            if (!name) {
              skipped++;
              continue;
            }

            let supplierId: string | null = null;
            const supplierName = (row.supplier || "").trim();
            if (supplierName) {
              const key = supplierName.toLowerCase();
              if (supplierMap.has(key)) {
                supplierId = supplierMap.get(key)!;
              } else {
                const { data, error } = await supabase
                  .from("suppliers")
                  .insert({ name: supplierName })
                  .select()
                  .single();
                if (!error && data) {
                  supplierId = data.id;
                  supplierMap.set(key, data.id);
                  newSuppliers.push({ id: data.id, name: data.name });
                }
              }
            }

            toInsert.push({
              name,
              supplier_id: supplierId,
              coverage_m2: parseNum(row.coverage_m2) || 1,
              pack_cost_ex_gst: parseNum(row.pack_cost_ex_gst),
              installer_rate_per_m2: parseNum(row.installer_rate_per_m2),
              supply_charge_per_pack: parseNum(row.supply_charge_per_pack),
              supply_install_rate_per_m2: parseNum(row.supply_install_rate_per_m2),
              pack_per_multi: parseIntish(row.pack_per_multi),
              multi: parseIntish(row.multi),
              pks: parseIntish(row.pks),
              is_stock_item: parseBool(row.is_stock_item, true),
            });
          }

          if (toInsert.length > 0) {
            const { data, error } = await supabase.from("parts").insert(toInsert).select();
            if (error) {
              alert(`Import failed: ${error.message}`);
            } else if (data) {
              setParts((prev) => [...(data as Part[]), ...prev]);
              if (newSuppliers.length > 0) setSupplierList((prev) => [...prev, ...newSuppliers]);
              alert(
                `Imported ${data.length} item(s).` +
                  (newSuppliers.length > 0 ? ` Created ${newSuppliers.length} new supplier(s).` : "") +
                  (skipped > 0 ? ` Skipped ${skipped} row(s) with no item name.` : "")
              );
            }
          } else {
            alert("No valid rows found in that file — check the item name column is filled in.");
          }
        } finally {
          setImporting(false);
        }
      },
      error: (err) => {
        setImporting(false);
        alert(`Could not read that file: ${err.message}`);
      },
    });
  }

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
        <div className="flex items-center gap-3">
          <button onClick={downloadCsvTemplate} className="text-sm text-[var(--muted)] hover:underline">
            Download CSV template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Add item
          </button>
        </div>
      </div>

      {/* KPI cards: total value + per-supplier value */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-[var(--border)] p-3">
          <div className="text-xs uppercase text-[var(--muted)]">Total inventory value</div>
          <div className="mt-1 text-lg font-bold">{fmtCurrency(grandTotal)}</div>
        </div>
        {supplierTotals.map(([supplier, value]) => {
          const name = supplier.toLowerCase();
          const tone = name.includes("fletcher")
            ? "border-green-400 bg-green-100 text-green-900"
            : name.includes("csr")
            ? "border-red-400 bg-red-100 text-red-900"
            : "border-[var(--border)]";
          return (
            <div key={supplier} className={`rounded-xl border p-3 ${tone}`}>
              <div className="text-xs uppercase opacity-70">{supplier}</div>
              <div className="mt-1 text-lg font-bold">{fmtCurrency(value)}</div>
            </div>
          );
        })}
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

      <p className="mt-3 text-xs text-[var(--muted)]">
        Drag a column's right edge to resize it — your widths are remembered next time you open this page.
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="table-fixed text-sm" style={{ width: colWidths.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead className="bg-[#f2f0ec] text-xs uppercase text-[var(--muted)]">
            <tr>
              {INVENTORY_COLS.map((c, i) => (
                <ResizableTh key={c.key} label={c.label} align={c.align} onResizeStart={startResize(i)} />
              ))}
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
                <td className="px-3 py-1 text-center font-mono">{p.stock_on_hand}</td>
                <td className="px-1 py-1">
                  <InlineSelect
                    value={p.supplier_id || ""}
                    options={supplierList}
                    onCommit={(v) => patch(p, "supplier_id", v)}
                    align="center"
                  />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.coverage_m2} onCommit={(v) => patch(p, "coverage_m2", v)} align="center" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.pack_cost_ex_gst} onCommit={(v) => patch(p, "pack_cost_ex_gst", v)} align="center" prefix="$" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell
                    type="number"
                    value={p.coverage_m2 > 0 ? Math.round((p.pack_cost_ex_gst / p.coverage_m2) * 100) / 100 : 0}
                    onCommit={(v) => patch(p, "pack_cost_ex_gst", Math.round(Number(v) * p.coverage_m2 * 100) / 100)}
                    align="center"
                    prefix="$"
                  />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.installer_rate_per_m2} onCommit={(v) => patch(p, "installer_rate_per_m2", v)} align="center" prefix="$" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.supply_charge_per_pack} onCommit={(v) => patch(p, "supply_charge_per_pack", v)} align="center" prefix="$" />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.pks} onCommit={(v) => patch(p, "pks", v)} align="center" integer />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.multi} onCommit={(v) => patch(p, "multi", v)} align="center" integer />
                </td>
                <td className="px-1 py-1">
                  <InlineCell type="number" value={p.pack_per_multi} onCommit={(v) => patch(p, "pack_per_multi", v)} align="center" integer />
                </td>
                <td className="px-1 py-1">
                  <InlineCell
                    type="number"
                    value={p.supply_install_rate_per_m2}
                    onCommit={(v) => patch(p, "supply_install_rate_per_m2", v)}
                    align="center"
                    prefix="$"
                  />
                </td>
                <td className="px-3 py-1 text-center font-medium">
                  {fmtCurrency(p.pack_cost_ex_gst * p.stock_on_hand)}
                </td>
                <td className="px-3 py-1 text-center">
                  <button onClick={() => toggleArchive(p)} className="text-[var(--muted)] hover:underline">
                    {p.archived ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-[var(--muted)]">
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
                    {supplierList.map((s) => (
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
                    step="1"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.pack_per_multi}
                    onChange={(e) => setForm({ ...form, pack_per_multi: Math.round(Number(e.target.value)) })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Multi
                  <input
                    type="number"
                    step="1"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.multi}
                    onChange={(e) => setForm({ ...form, multi: Math.round(Number(e.target.value)) })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Pks
                  <input
                    type="number"
                    step="1"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.pks}
                    onChange={(e) => setForm({ ...form, pks: Math.round(Number(e.target.value)) })}
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
