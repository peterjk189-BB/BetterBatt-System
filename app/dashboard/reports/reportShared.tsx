"use client";

// Helpers shared by the report tabs (moved out of ReportsView so each report can live in its own file).

import { useState } from "react";
import { supplyInstallCharge } from "@/lib/contractPricing";
import { supplyPackPrice } from "@/lib/priceTiers";
import { pricedPart } from "@/lib/frozenPrices";

export type Project = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  job_type: string;
  outcome: "Open" | "Accepted" | "Complete" | "Lost" | "Cancelled" | "Superseded";
  revision_letter?: string | null;
  address?: string | null;
  suburb?: string | null;
  accepted_at?: string | null;
  emailed_at?: string | null;
  entry_date: string;
  quote_markup: number;
  price_tier?: string | null;
  archived: boolean;
  customers: { name: string; discount_pct: number } | null;
};

export type ProjectLine = {
  id: string;
  project_id: string;
  qty_m2: number;
  contract_rate?: number | null;
  parts: {
    name?: string;
    coverage_m2: number;
    pack_cost_ex_gst: number;
    installer_rate_per_m2: number;
    supply_charge_per_pack: number;
    price_retail?: number | null;
    price_trade?: number | null;
    price_regency?: number | null;
    supply_install_rate_per_m2: number;
  } | null;
};

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

export type Preset = "month" | "quarter" | "year" | "all" | "custom";

export function toDateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function presetRange(preset: Preset, customStart: string, customEnd: string): { start: string | null; end: string | null } {
  if (preset === "all") return { start: null, end: null };
  if (preset === "custom") return { start: customStart || null, end: customEnd || null };
  const now = new Date();
  const y = now.getFullYear();
  if (preset === "month") {
    return { start: toDateOnly(new Date(y, now.getMonth(), 1)), end: toDateOnly(new Date(y, now.getMonth() + 1, 0)) };
  }
  if (preset === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: toDateOnly(new Date(y, q * 3, 1)), end: toDateOnly(new Date(y, q * 3 + 3, 0)) };
  }
  return { start: toDateOnly(new Date(y, 0, 1)), end: toDateOnly(new Date(y, 11, 31)) };
}

export function inRange(dateStr: string | null, start: string | null, end: string | null) {
  if (!dateStr) return false;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

export function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function fmtNumber(n: number) {
  return n.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

export function DateFilter({
  preset,
  setPreset,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}: {
  preset: Preset;
  setPreset: (p: Preset) => void;
  customStart: string;
  setCustomStart: (s: string) => void;
  customEnd: string;
  setCustomEnd: (s: string) => void;
}) {
  const btn = (p: Preset, label: string) => (
    <button
      onClick={() => setPreset(p)}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        preset === p ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {btn("month", "This month")}
      {btn("quarter", "This quarter")}
      {btn("year", "This year")}
      {btn("all", "All time")}
      {btn("custom", "Custom range")}
      {preset === "custom" && (
        <span className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
          />
          <span className="text-[var(--muted)]">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
          />
        </span>
      )}
    </div>
  );
}

export function useDateRange(initial: Preset = "month") {
  const [preset, setPreset] = useState<Preset>(initial);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = presetRange(preset, customStart, customEnd);
  return { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range };
}

/** Quote value inc. GST, worked out the same way the quote page does. */
export function computeProjectValue(project: Project, lines: ProjectLine[]) {
  const isSupplyOnly = project.job_type === "SUPPLY ONLY";
  const discountPct = project.customers?.discount_pct || 0;
  const chargeBeforeMarkup = lines.reduce((s, l) => {
    const part = pricedPart(l.parts, l as any);
    if (!part) return s;
    const q = Number(l.qty_m2) || 0;
    const packs = part.coverage_m2 > 0 ? Math.ceil(q / part.coverage_m2) : 0;
    const gross = isSupplyOnly ? packs * supplyPackPrice(part, project.price_tier) : supplyInstallCharge(q, part, l.contract_rate);
    return s + gross;
  }, 0);
  const discountTotal = chargeBeforeMarkup * (discountPct / 100);
  const subtotal = chargeBeforeMarkup - discountTotal + (Number(project.quote_markup) || 0);
  return subtotal + subtotal * 0.1;
}

