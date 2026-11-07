"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import PartPicker from "@/app/dashboard/PartPicker";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { activeRateDate, type ContractRate } from "@/lib/contractPricing";

type Part = {
  id: string;
  name: string;
  code: string | null;
  supplier_id: string | null;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  installer_rate_per_m2: number;
  supply_install_rate_per_m2: number;
  is_stock_item: boolean | null;
};

type Row = {
  key: string;
  id?: string;
  part_id: string | null;
  builder_description: string;
  rate: string; // typed text, so "9." isn't wiped while typing
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const today = () => new Date().toISOString().slice(0, 10);
const dmy = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
let keySeq = 0;
const newKey = () => `n${++keySeq}`;
const MIN_MARGIN_KEY = "coverage-contract-min-margin";

function toRows(rates: ContractRate[], date: string | null): Row[] {
  return rates
    .filter((r) => r.effective_from === date)
    .sort((a, b) => a.sort_order - b.sort_order || a.builder_description.localeCompare(b.builder_description))
    .map((r) => ({ key: r.id, id: r.id, part_id: r.part_id, builder_description: r.builder_description, rate: String(Number(r.rate_per_m2) || "") }));
}

export default function ContractPricing({
  customer,
  parts,
  suppliers,
  initialRates,
  tableMissing,
}: {
  customer: { id: string; name: string; category: string };
  parts: Part[];
  suppliers: { id: string; name: string }[];
  initialRates: ContractRate[];
  tableMissing: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);
  const supplierName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const [allRates, setAllRates] = useState<ContractRate[]>(initialRates);
  const savedDates = useMemo(() => Array.from(new Set(allRates.map((r) => r.effective_from))).sort().reverse(), [allRates]);
  const currentDate = activeRateDate(allRates, today());
  const [setDate, setSetDate] = useState<string>(currentDate || today());
  const [rows, setRows] = useState<Row[]>(() => toRows(initialRates, currentDate));
  const [removed, setRemoved] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newSetOpen, setNewSetOpen] = useState(false);
  const [newSetDate, setNewSetDate] = useState(today());
  const [importNote, setImportNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Product list for the picker: every Inventory item by default; can be narrowed to one supplier.
  const [supplierPick, setSupplierPick] = useState<string>("");
  const pickerParts = parts.filter((p) => !supplierPick || p.supplier_id === supplierPick);

  const [minMargin, setMinMargin] = useState(15);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(MIN_MARGIN_KEY));
      if (v > 0) setMinMargin(v);
    } catch {
      // storage unavailable: keep the default
    }
  }, []);
  function changeMinMargin(v: number) {
    setMinMargin(v);
    try {
      localStorage.setItem(MIN_MARGIN_KEY, String(v));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setMessage(null);
  }
  function addRow() {
    setRows((prev) => [...prev, { key: newKey(), part_id: null, builder_description: "", rate: "" }]);
    setDirty(true);
  }
  function removeRow(r: Row) {
    if (r.id) setRemoved((prev) => [...prev, r.id!]);
    setRows((prev) => prev.filter((x) => x.key !== r.key));
    setDirty(true);
  }
  function move(idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setDirty(true);
  }

  function chooseSet(date: string) {
    if (dirty && !confirm("You have unsaved changes on this rate set. Discard them?")) return;
    setSetDate(date);
    setRows(toRows(allRates, date));
    setRemoved([]);
    setDirty(false);
    setMessage(null);
  }

  function startNewSet() {
    if (!newSetDate) return;
    if (savedDates.includes(newSetDate)) {
      alert(`There is already a rate set from ${dmy(newSetDate)} — pick it from the list to edit it.`);
      return;
    }
    // Copy the lines on screen as the starting point; nothing is saved until "Save".
    setRows(rows.map((r) => ({ ...r, key: newKey(), id: undefined })));
    setRemoved([]);
    setSetDate(newSetDate);
    setDirty(true);
    setNewSetOpen(false);
    setMessage({ ok: true, text: `New rate set from ${dmy(newSetDate)} — change the rates, then Save.` });
  }

  function figures(r: Row) {
    const p = r.part_id ? partById[r.part_id] : undefined;
    const rate = Number(r.rate) || 0;
    const cost = p && p.coverage_m2 > 0 ? Number(p.pack_cost_ex_gst) / Number(p.coverage_m2) : 0;
    const inst = p ? Number(p.installer_rate_per_m2) || 0 : 0;
    const std = p ? Number(p.supply_install_rate_per_m2) || 0 : 0;
    const margin = rate > 0 && p ? ((rate - cost - inst) / rate) * 100 : null;
    return { p, rate, cost, inst, std, margin };
  }

  async function reload() {
    const { data } = await supabase.from("customer_contract_rates").select("*").eq("customer_id", customer.id).eq("archived", false);
    return (data ?? []) as ContractRate[];
  }

  async function save() {
    const blank = rows.find((r) => !r.builder_description.trim());
    if (blank) {
      setMessage({ ok: false, text: "Every line needs the builder's wording." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const errors: string[] = [];
    const payload = (r: Row, i: number) => ({
      customer_id: customer.id,
      part_id: r.part_id || null,
      builder_description: r.builder_description.trim(),
      rate_per_m2: Math.round((Number(r.rate) || 0) * 100) / 100,
      effective_from: setDate,
      sort_order: i,
    });
    for (const [i, r] of rows.entries()) {
      if (!r.id) continue;
      const { error } = await supabase.from("customer_contract_rates").update(payload(r, i)).eq("id", r.id);
      if (error) errors.push(error.message);
    }
    const inserts = rows.map((r, i) => (r.id ? null : payload(r, i))).filter(Boolean);
    if (inserts.length) {
      const { error } = await supabase.from("customer_contract_rates").insert(inserts as any[]);
      if (error) errors.push(error.message);
    }
    if (removed.length) {
      // Archived, not deleted: quotes that used a line keep their copy of the rate and wording anyway.
      const { error } = await supabase.from("customer_contract_rates").update({ archived: true }).in("id", removed);
      if (error) errors.push(error.message);
    }
    const fresh = await reload();
    setAllRates(fresh);
    setRows(toRows(fresh, setDate));
    setRemoved([]);
    setSaving(false);
    if (errors.length) {
      setMessage({ ok: false, text: errors[0] });
      return;
    }
    setDirty(false);
    setMessage({ ok: true, text: "Saved." });
    logAudit(supabase, {
      eventType: "update",
      entityType: "customer",
      entityId: customer.id,
      entityLabel: customer.name,
      details: `Contract pricing from ${dmy(setDate)} saved (${rows.length} lines)`,
    });
    router.refresh();
  }

  // CSV columns (any order, header names are forgiving):
  //   Builder wording | Inventory item (name or code) | Rate (contract $/m² ex GST)
  function importCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const pick = (row: Record<string, string>, names: string[]) => {
          const k = Object.keys(row).find((h) => names.includes(norm(h)));
          return k ? String(row[k] ?? "").trim() : "";
        };
        const byName = new Map(parts.map((p) => [p.name.trim().toLowerCase(), p.id]));
        const byCode = new Map(parts.filter((p) => p.code).map((p) => [String(p.code).trim().toLowerCase(), p.id]));
        const added: Row[] = [];
        const unmatched: string[] = [];
        for (const row of res.data) {
          const desc = pick(row, ["builderwording", "builderdescription", "description", "builderproduct", "wording"]);
          if (!desc) continue;
          const item = pick(row, ["inventoryitem", "inventory", "product", "item", "fletcherproduct", "code", "partname"]);
          const rate = pick(row, ["rate", "ratepersqm", "ratem2", "ratepm2", "contractrate", "ratepermetre", "ratepersquaremetre", "m2rate", "price"]).replace(/[$,\s]/g, "");
          const partId = item ? byCode.get(item.toLowerCase()) || byName.get(item.toLowerCase()) || null : null;
          if (item && !partId) unmatched.push(`${desc} → "${item}"`);
          added.push({ key: newKey(), part_id: partId, builder_description: desc, rate: rate && !Number.isNaN(Number(rate)) ? rate : "" });
        }
        if (added.length === 0) {
          setImportNote("No lines found. The CSV needs columns: Builder wording, Inventory item, Rate.");
          return;
        }
        setRows((prev) => [...prev, ...added]);
        setDirty(true);
        setImportNote(
          `Added ${added.length} line${added.length === 1 ? "" : "s"} — check them, then Save.` +
            (unmatched.length ? ` ${unmatched.length} inventory item${unmatched.length === 1 ? "" : "s"} not found (pick them below): ${unmatched.join("; ")}` : "")
        );
      },
      error: (err) => setImportNote(`Could not read the file: ${err.message}`),
    });
  }

  const totals = rows.map(figures);
  const flagged = totals.filter((t) => t.margin !== null && t.margin < minMargin).length;
  const isCurrent = setDate === currentDate;
  const dateOptions = Array.from(new Set([...savedDates, setDate])).sort().reverse();

  if (tableMissing) {
    return (
      <div className="max-w-3xl">
        <Link href="/dashboard/customers" className="text-sm text-[var(--muted)] hover:underline">
          &larr; Customers
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Contract pricing — {customer.name}</h1>
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Contract pricing isn&apos;t set up in the database yet. In Supabase open <strong>SQL Editor</strong>, paste the contents of{" "}
          <code>supabase/migrations/0090_builder_contract_rates.sql</code>, click <strong>Run</strong>, then refresh this page.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/dashboard/customers" className="text-sm text-[var(--muted)] hover:underline">
        &larr; Customers
      </Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contract pricing — {customer.name}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            The builder&apos;s agreed supply &amp; install rate per m², in their own wording. Each line links to an Inventory item, which
            still supplies the stock, packs, cost and installer rate. On a quote for {customer.name}, these lines replace the normal
            Supply+install/m² price, and the builder&apos;s wording is what prints on the quote.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCsv(f);
              e.target.value = "";
            }}
          />
          <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
            Import CSV
          </button>
          <button onClick={addRow} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
            + Add line
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Rates effective from
          <select value={setDate} onChange={(e) => chooseSet(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5">
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {dmy(d)}
                {d === currentDate ? " (current)" : !savedDates.includes(d) ? " (not saved yet)" : d > today() ? " (future)" : ""}
              </option>
            ))}
          </select>
        </label>
        {!newSetOpen ? (
          <button onClick={() => setNewSetOpen(true)} className="text-accent hover:underline">
            Start new rate set…
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <input type="date" value={newSetDate} onChange={(e) => setNewSetDate(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1" />
            <button onClick={startNewSet} className="rounded-lg bg-[#201f1c] px-3 py-1 text-white">
              Copy these lines to the new date
            </button>
            <button onClick={() => setNewSetOpen(false)} className="text-[var(--muted)] hover:underline">
              Cancel
            </button>
          </span>
        )}
        <span className="text-[var(--muted)]">
          {isCurrent ? "Used on quotes dated today." : "Quotes use the latest set dated on or before the quote date."} Older sets are kept so past quotes don&apos;t change.
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Inventory items from
          <select value={supplierPick} onChange={(e) => setSupplierPick(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5">
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Flag margin under
          <input
            type="number"
            min={0}
            step={1}
            value={minMargin}
            onChange={(e) => changeMinMargin(Number(e.target.value) || 0)}
            className="w-16 rounded-lg border border-[var(--border)] px-2 py-1"
          />
          %
        </label>
        {flagged > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            {flagged} line{flagged === 1 ? "" : "s"} under {minMargin}%
          </span>
        )}
      </div>

      {message && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            message.ok ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}
      {importNote && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-[#f2f0ec] px-3 py-2 text-sm dark:bg-[#3a3a3a]">
          <span>{importNote}</span>
          <button onClick={() => setImportNote(null)} className="text-[var(--muted)] hover:underline">
            Close
          </button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Builder wording (on the quote)</th>
              <th className="px-3 py-2">Linked Inventory item</th>
              <th className="px-3 py-2 text-right">Cost /m²</th>
              <th className="px-3 py-2 text-right">Installer /m²</th>
              <th className="px-3 py-2 text-right">Normal S+I /m²</th>
              <th className="px-3 py-2 text-right">Contract /m² ex GST</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[var(--muted)]">
                  No contract lines yet — click <strong>+ Add line</strong> or <strong>Import CSV</strong> (columns: Builder wording, Inventory item, Rate).
                </td>
              </tr>
            )}
            {rows.map((r, idx) => {
              const f = totals[idx];
              const low = f.margin !== null && f.margin < minMargin;
              return (
                <tr key={r.key} className="border-t border-[var(--border)] align-top">
                  <td className="px-3 py-2">
                    <input
                      value={r.builder_description}
                      onChange={(e) => edit(r.key, { builder_description: e.target.value })}
                      placeholder="e.g. Wall insulation R2.5 – 90mm stud"
                      className="w-72 rounded-lg border border-[var(--border)] px-2 py-1.5 font-medium"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <PartPicker
                      className="w-80"
                      parts={pickerParts.some((p) => p.id === r.part_id) || !r.part_id ? pickerParts : [...pickerParts, partById[r.part_id]].filter(Boolean)}
                      value={r.part_id}
                      onChange={(id) => edit(r.key, { part_id: id })}
                      placeholder="Pick the Inventory item…"
                    />
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {f.p
                        ? `${(f.p.supplier_id && supplierName[f.p.supplier_id]) || "No supplier"} · ${Number(f.p.coverage_m2) || 0} m²/pack${f.p.is_stock_item === false ? " · non-stock" : ""}`
                        : r.part_id
                        ? "Item archived in Inventory"
                        : "Not linked — no stock, packs or costing until you pick one"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.p ? money(f.cost) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.p ? money(f.inst) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">{f.p && f.std > 0 ? money(f.std) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      $
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={r.rate}
                        onChange={(e) => edit(r.key, { rate: e.target.value })}
                        className="w-24 rounded-lg border border-orange-300 bg-orange-50 px-2 py-1.5 text-right font-semibold text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
                      />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {f.margin === null ? (
                      <span className="text-[var(--muted)]">—</span>
                    ) : (
                      <span
                        className={`rounded-md px-2 py-0.5 font-semibold tabular-nums ${
                          low ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                        }`}
                        title={`Contract ${money(f.rate)} − cost ${money(f.cost)} − installer ${money(f.inst)} = ${money(f.rate - f.cost - f.inst)} per m²`}
                      >
                        {f.margin.toFixed(1)}%{low ? " ▲ low" : ""}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="px-1 text-[var(--muted)] disabled:opacity-30" aria-label="Move up">
                      ↑
                    </button>
                    <button onClick={() => move(idx, 1)} disabled={idx === rows.length - 1} className="px-1 text-[var(--muted)] disabled:opacity-30" aria-label="Move down">
                      ↓
                    </button>
                    <button onClick={() => removeRow(r)} className="ml-2 text-[var(--muted)] hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Cost /m² = Inventory pack cost ÷ m² per pack. Margin = (contract rate − cost − installer rate) ÷ contract rate, before travel allowance.
        Contract lines charge the rate on the m² entered on the quote (not rounded up to whole packs), so the total matches the builder&apos;s PO.
      </p>
    </div>
  );
}
