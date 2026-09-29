"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";

type Part = {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
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
  code: "",
  name: "",
  type: "",
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
  "code",
  "name",
  "type",
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
  ["15250", "R2.5 Wall Batt", "WALLS", "Fletcher Insulation", "TRUE", "6.3", "42.50", "3.20", "9.90", "12.40", "1", "24", "0"],
  ["15229", "Ceiling Blanket R6.0", "CEILINGS", "CSR Bradford", "TRUE", "10.8", "65.00", "2.80", "8.50", "10.90", "1", "12", "0"],
  ["", "Delivery", "", "", "FALSE", "1", "0", "0", "0", "45.00", "0", "0", "0"],
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
  { key: "code", label: "Code", align: "center" as Align, width: 90 },
  { key: "name", label: "Item", align: "left" as Align, width: 220 },
  { key: "supplier", label: "Supplier", align: "center" as Align, width: 110 },
  { key: "type", label: "Type", align: "center" as Align, width: 100 },
  { key: "coverage", label: "Coverage/pack", align: "center" as Align, width: 110 },
  { key: "packPerMulti", label: "Pack per multi", align: "center" as Align, width: 110 },
  { key: "packCost", label: "Pack cost ex", align: "center" as Align, width: 110 },
  { key: "covCostM2", label: "Cov/Cost/m²", align: "center" as Align, width: 110 },
  { key: "supplyInstall", label: "Supply+install/m²", align: "center" as Align, width: 130 },
  { key: "installerRate", label: "Installer rate/m²", align: "center" as Align, width: 120 },
  { key: "supplyPack", label: "Supply/pack", align: "center" as Align, width: 110 },
  { key: "pks", label: "Pks", align: "center" as Align, width: 70 },
  { key: "multi", label: "Multi", align: "center" as Align, width: 70 },
  { key: "stock", label: "Stock on hand", align: "center" as Align, width: 110 },
  { key: "totalM2", label: "Total m²", align: "center" as Align, width: 100 },
  { key: "value", label: "Inventory value", align: "center" as Align, width: 130 },
  { key: "actions", label: "", align: "center" as Align, width: 90 },
];

const COL_WIDTHS_KEY = "coverage-inventory-col-widths";
const COL_ORDER_KEY = "coverage-inventory-col-order";
const DEFAULT_COL_ORDER = INVENTORY_COLS.map((c) => c.key);
const DEFAULT_COL_WIDTHS: Record<string, number> = Object.fromEntries(
  INVENTORY_COLS.map((c) => [c.key, c.width])
);
const HIDDEN_COLS_KEY = "coverage-inventory-hidden-cols";
// Columns the user can choose to hide — "Item" and the archive action stay put so every row is
// always identifiable and actionable.
const TOGGLEABLE_COLS = INVENTORY_COLS.filter((c) => c.key !== "name" && c.key !== "actions");

const TD_CLASS: Record<string, string> = {
  stock: "px-3 py-1 text-center font-mono",
  totalM2: "px-3 py-1 text-center font-mono text-[var(--muted)]",
  value: "px-3 py-1 text-center font-medium",
  actions: "px-3 py-1 text-center",
};

// A column header that can be dragged wider/narrower from its right edge, or picked up and
// dropped on another header to reorder the columns.
function ResizableTh({
  label,
  align,
  isDragging,
  onResizeStart,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  label: string;
  align: Align;
  isDragging?: boolean;
  onResizeStart: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}) {
  return (
    <th
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`relative cursor-move select-none whitespace-normal break-words px-3 py-2 align-bottom leading-tight ${
        TEXT_ALIGN[align]
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {label}
      <span
        draggable={false}
        onMouseDown={(e) => {
          // Stop the header's own drag-to-reorder from hijacking this — without this, the
          // browser can start dragging the whole column instead of resizing it.
          e.preventDefault();
          e.stopPropagation();
          onResizeStart(e);
        }}
        onDragStart={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-accent/40"
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

  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COL_WIDTHS);
  const [colOrder, setColOrder] = useState<string[]>(DEFAULT_COL_ORDER);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Load any previously saved column widths/order for this browser, so the layout stays the way it was left.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COL_WIDTHS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // legacy format from before columns were reorderable — map positionally onto today's keys
          const migrated: Record<string, number> = {};
          INVENTORY_COLS.forEach((c, i) => {
            migrated[c.key] = parsed[i] ?? c.width;
          });
          setColWidths(migrated);
        } else if (parsed && typeof parsed === "object") {
          setColWidths({ ...DEFAULT_COL_WIDTHS, ...parsed });
        }
      }
    } catch {
      // no saved widths yet, or storage unavailable — fall back to defaults
    }

    try {
      const savedOrder = localStorage.getItem(COL_ORDER_KEY);
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) {
          const known = parsed.filter((k: string) => DEFAULT_COL_ORDER.includes(k));
          const missing = DEFAULT_COL_ORDER.filter((k) => !known.includes(k));
          setColOrder([...known, ...missing]);
        }
      }
    } catch {
      // no saved order yet, or storage unavailable — fall back to defaults
    }

    try {
      const savedHidden = localStorage.getItem(HIDDEN_COLS_KEY);
      if (savedHidden) {
        const parsed = JSON.parse(savedHidden);
        if (Array.isArray(parsed)) {
          setHiddenCols(new Set(parsed.filter((k: string) => DEFAULT_COL_ORDER.includes(k))));
        }
      }
    } catch {
      // no saved hidden-columns yet, or storage unavailable — fall back to showing everything
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const next = Math.max(50, startWidth + (e.clientX - startX));
      setColWidths((prev) => ({ ...prev, [key]: next }));
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

  const startResize = (key: string) => (e: React.MouseEvent) => {
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] ?? DEFAULT_COL_WIDTHS[key] };
  };

  // Drop a dragged column header (sourceKey) onto another (targetKey) to move it there.
  function moveColumn(sourceKey: string, targetKey: string) {
    if (sourceKey === targetKey) return;
    setColOrder((prev) => {
      const next = prev.filter((k) => k !== sourceKey);
      const targetIdx = next.indexOf(targetKey);
      next.splice(targetIdx, 0, sourceKey);
      try {
        localStorage.setItem(COL_ORDER_KEY, JSON.stringify(next));
      } catch {
        // ignore — persistence is a nice-to-have, not required for the table to work
      }
      return next;
    });
  }

  function toggleColumn(key: string) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore — persistence is a nice-to-have, not required for the table to work
      }
      return next;
    });
  }

  const visibleColOrder = useMemo(
    () => colOrder.filter((key) => !hiddenCols.has(key)),
    [colOrder, hiddenCols]
  );

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
              code: (row.code || "").trim() || null,
              name,
              type: (row.type || "").trim() || null,
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

  // Renders one cell's content for a given column key — used so columns can be reordered
  // freely while each cell still knows how to draw and save itself.
  function renderCell(key: string, p: Part) {
    switch (key) {
      case "code":
        return <InlineCell value={p.code || ""} onCommit={(v) => patch(p, "code", v)} align="center" />;
      case "name":
        return (
          <div className="flex items-center gap-1.5 px-2">
            <InlineCell value={p.name} onCommit={(v) => patch(p, "name", v)} />
            {!p.is_stock_item && (
              <span className="shrink-0 rounded bg-[#f2f0ec] px-1.5 py-0.5 text-xs text-[var(--muted)]">
                Non-stock
              </span>
            )}
          </div>
        );
      case "type":
        return <InlineCell value={p.type || ""} onCommit={(v) => patch(p, "type", v)} align="center" />;
      case "stock":
        return p.stock_on_hand;
      case "totalM2":
        return (p.stock_on_hand * p.coverage_m2).toLocaleString("en-AU", { maximumFractionDigits: 1 });
      case "supplier":
        return (
          <InlineSelect
            value={p.supplier_id || ""}
            options={supplierList}
            onCommit={(v) => patch(p, "supplier_id", v)}
            align="center"
          />
        );
      case "coverage":
        return (
          <InlineCell type="number" value={p.coverage_m2} onCommit={(v) => patch(p, "coverage_m2", v)} align="center" />
        );
      case "packCost":
        return (
          <InlineCell
            type="number"
            value={p.pack_cost_ex_gst}
            onCommit={(v) => patch(p, "pack_cost_ex_gst", v)}
            align="center"
            prefix="$"
          />
        );
      case "covCostM2":
        return (
          <InlineCell
            type="number"
            value={p.coverage_m2 > 0 ? Math.round((p.pack_cost_ex_gst / p.coverage_m2) * 100) / 100 : 0}
            onCommit={(v) => patch(p, "pack_cost_ex_gst", Math.round(Number(v) * p.coverage_m2 * 100) / 100)}
            align="center"
            prefix="$"
          />
        );
      case "installerRate":
        return (
          <InlineCell
            type="number"
            value={p.installer_rate_per_m2}
            onCommit={(v) => patch(p, "installer_rate_per_m2", v)}
            align="center"
            prefix="$"
          />
        );
      case "supplyPack":
        return (
          <InlineCell
            type="number"
            value={p.supply_charge_per_pack}
            onCommit={(v) => patch(p, "supply_charge_per_pack", v)}
            align="center"
            prefix="$"
          />
        );
      case "pks":
        return <InlineCell type="number" value={p.pks} onCommit={(v) => patch(p, "pks", v)} align="center" integer />;
      case "multi":
        return <InlineCell type="number" value={p.multi} onCommit={(v) => patch(p, "multi", v)} align="center" integer />;
      case "packPerMulti":
        return (
          <InlineCell
            type="number"
            value={p.pack_per_multi}
            onCommit={(v) => patch(p, "pack_per_multi", v)}
            align="center"
            integer
          />
        );
      case "supplyInstall":
        return (
          <InlineCell
            type="number"
            value={p.supply_install_rate_per_m2}
            onCommit={(v) => patch(p, "supply_install_rate_per_m2", v)}
            align="center"
            prefix="$"
          />
        );
      case "value":
        return fmtCurrency(p.pack_cost_ex_gst * p.stock_on_hand);
      case "actions":
        return (
          <button onClick={() => toggleArchive(p)} className="text-[var(--muted)] hover:underline">
            {p.archived ? "Restore" : "Archive"}
          </button>
        );
      default:
        return null;
    }
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
          <div className="relative">
            <button
              onClick={() => setColumnsMenuOpen((v) => !v)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium"
            >
              Columns{hiddenCols.size > 0 ? ` (${hiddenCols.size} hidden)` : ""}
            </button>
            {columnsMenuOpen && (
              <>
                {/* Click-catcher to close the menu when clicking elsewhere */}
                <div className="fixed inset-0 z-10" onClick={() => setColumnsMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
                  <p className="px-2 py-1 text-xs font-medium uppercase text-[var(--muted)]">
                    Show columns
                  </p>
                  <div className="max-h-72 overflow-y-auto">
                    {TOGGLEABLE_COLS.map((c) => (
                      <label
                        key={c.key}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/[0.03]"
                      >
                        <input
                          type="checkbox"
                          checked={!hiddenCols.has(c.key)}
                          onChange={() => toggleColumn(c.key)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                  {hiddenCols.size > 0 && (
                    <button
                      onClick={() => {
                        setHiddenCols(new Set());
                        try {
                          localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([]));
                        } catch {
                          // ignore
                        }
                      }}
                      className="mt-1 w-full rounded px-2 py-1 text-left text-sm text-[var(--muted)] hover:underline"
                    >
                      Show all
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
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
        Drag a column's right edge to resize it, or drag its header left/right to reorder it —
        both are remembered next time you open this page.
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table
          className="table-fixed text-sm"
          style={{ width: visibleColOrder.reduce((a, key) => a + (colWidths[key] ?? DEFAULT_COL_WIDTHS[key]), 0) }}
        >
          <colgroup>
            {visibleColOrder.map((key) => (
              <col key={key} style={{ width: colWidths[key] ?? DEFAULT_COL_WIDTHS[key] }} />
            ))}
          </colgroup>
          <thead className="bg-[#f2f0ec] text-xs uppercase text-[var(--muted)]">
            <tr>
              {visibleColOrder.map((key) => {
                const c = INVENTORY_COLS.find((col) => col.key === key)!;
                return (
                  <ResizableTh
                    key={c.key}
                    label={c.label}
                    align={c.align}
                    isDragging={dragKey === c.key}
                    onResizeStart={startResize(c.key)}
                    onDragStart={(e) => {
                      setDragKey(c.key);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.key);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const sourceKey = e.dataTransfer.getData("text/plain") || dragKey;
                      if (sourceKey) moveColumn(sourceKey, c.key);
                      setDragKey(null);
                    }}
                    onDragEnd={() => setDragKey(null)}
                  />
                );
              })}
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
                {visibleColOrder.map((key) => (
                  <td key={key} className={TD_CLASS[key] ?? "px-1 py-1"}>
                    {renderCell(key, p)}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={visibleColOrder.length} className="px-4 py-8 text-center text-[var(--muted)]">
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
              <div className="grid grid-cols-3 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  Code
                  <input
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1 text-sm">
                  Item name
                  <input
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  Type
                  <input
                    placeholder="WALLS, CEILINGS, UNDERFLOOR..."
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  />
                </label>
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
