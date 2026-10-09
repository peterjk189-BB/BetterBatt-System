"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import CrmPanel from "@/app/dashboard/crm/CrmPanel";
import { ensureLead } from "@/lib/crmActions";
import { PRICE_TIERS, supplyPackPrice, tierLabel, tierPriceMissing } from "@/lib/priceTiers";

type Customer = {
  id: string;
  name: string;
  category: "Builder" | "Retro Fit" | "Private";
  discount_pct: number;
};

type Part = {
  id: string;
  name: string;
  coverage_m2: number;
  pack_cost_ex_gst: number;
  installer_rate_per_m2: number;
  supply_charge_per_pack: number;
  price_retail?: number | null;
  price_trade?: number | null;
  price_regency?: number | null;
  supply_install_rate_per_m2: number;
  is_stock_item: boolean;
};

type Project = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  job_type: string;
  category: string | null;
  outcome: "Open" | "Accepted" | "Lost" | "Cancelled";
  lot_no: string | null;
  address: string | null;
  suburb: string | null;
  entry_date: string;
  notes: string | null;
  quote_markup: number;
  show_qty_on_quote: boolean;
  price_tier?: string | null;
  archived: boolean;
  share_token?: string | null;
  accepted_at?: string | null;
  accepted_name?: string | null;
};

type Line = {
  id?: string;
  part_id: string | null;
  qty_m2: number;
  note: string | null;
  sort_order: number;
};

/** Values carried over from a site visit when a quote is started from it. */
export type QuotePrefill = {
  siteVisit: { id: string; visit_number: number };
  customer_id: string;
  customer_name: string;
  category: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  suburb: string;
  lines: Line[];
};

const JOB_TYPES = ["S+F QUOTE", "SUPPLY & INSTALL", "SUPPLY ONLY", "MATERIAL QUOTE", "OPTION QUOTE"];
const CATEGORIES = ["Builder", "Retro Fit", "Private"];
const OUTCOMES = ["Open", "Accepted", "Lost", "Cancelled"];

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function computeLine(part: Part | undefined, qty: number, tier: string | null) {
  if (!part) {
    return { packs: 0, usedForCal: 0, materialCost: 0, labourCost: 0, supplyOnlyCharge: 0, supplyInstallCharge: 0 };
  }
  const q = Number(qty) || 0;
  const packs = part.coverage_m2 > 0 ? Math.ceil(q / part.coverage_m2) : 0;
  const usedForCal = packs * part.coverage_m2;
  return {
    packs,
    usedForCal,
    materialCost: packs * part.pack_cost_ex_gst,
    labourCost: q * part.installer_rate_per_m2,
    supplyOnlyCharge: packs * supplyPackPrice(part, tier),
    supplyInstallCharge: usedForCal * part.supply_install_rate_per_m2,
  };
}

export default function QuoteEditor({
  project,
  lines,
  customers,
  parts,
  isAdmin,
  prefill = null,
  crmEnabled = false,
}: {
  project: Project | null;
  lines: Line[];
  customers: Customer[];
  parts: Part[];
  isAdmin: boolean;
  prefill?: QuotePrefill | null;
  crmEnabled?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const partById = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);
  const isNew = !project;
  const [tab, setTab] = useState<"details" | "crm">("details");

  // Local copy so a customer created on the fly (below) shows up in the dropdown right away.
  const [customerList, setCustomerList] = useState(customers);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    category: "Private" as Customer["category"],
    discount_pct: 0,
  });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState(project?.contact_email || "");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  async function copyCustomerLink() {
    if (!project?.share_token) return;
    const url = `${window.location.origin}/quote/${project.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
      return;
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function sendQuoteEmail() {
    if (!project) return;
    if (!emailAddress.trim()) {
      setEmailError("Enter an email address");
      return;
    }
    setEmailSending(true);
    setEmailError("");
    try {
      const res = await fetch("/api/quote-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, to_email: emailAddress.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || "Something went wrong");
        return;
      }
      setEmailSent(true);
    } catch {
      setEmailError("Something went wrong");
    } finally {
      setEmailSending(false);
    }
  }

  const [form, setForm] = useState({
    customer_id: project?.customer_id || prefill?.customer_id || "",
    contact_name: project?.contact_name || prefill?.contact_name || "",
    contact_phone: project?.contact_phone || prefill?.contact_phone || "",
    contact_email: project?.contact_email || prefill?.contact_email || "",
    job_type: project?.job_type || "SUPPLY & INSTALL",
    category: project?.category || prefill?.category || "",
    outcome: project?.outcome || "Open",
    lot_no: project?.lot_no || "",
    address: project?.address || prefill?.address || "",
    suburb: project?.suburb || prefill?.suburb || "",
    entry_date: project?.entry_date || new Date().toISOString().slice(0, 10),
    notes: project?.notes || "",
    quote_markup: project?.quote_markup ?? 0,
    show_qty_on_quote: project?.show_qty_on_quote ?? false,
    price_tier: project?.price_tier || "",
  });

  // The discount/markup can be entered as a flat $ amount or as a % of the line-items
  // subtotal — either way it's saved as a single $ figure (quote_markup), matching how
  // the business has always tracked it. Percent is just a convenience for entering it.
  const [adjustMode, setAdjustMode] = useState<"amount" | "percent">("amount");
  const [adjustPercent, setAdjustPercent] = useState(0);

  const [lineItems, setLineItems] = useState<Line[]>(
    lines.length > 0
      ? lines.map((l) => ({ ...l }))
      : prefill && prefill.lines.length > 0
      ? prefill.lines.map((l) => ({ ...l }))
      : [{ part_id: "", qty_m2: 0, note: "", sort_order: 0 }]
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setCustomer(customerId: string) {
    if (customerId === "__new__") {
      setNewCustomerForm({ name: form.customer_id ? "" : prefill?.customer_name || "", category: (form.category as Customer["category"]) || "Private", discount_pct: 0 });
      setNewCustomerOpen(true);
      return;
    }
    const c = customerList.find((x) => x.id === customerId);
    setForm((f) => ({ ...f, customer_id: customerId, category: c?.category || f.category }));
  }

  async function saveNewCustomer() {
    if (!newCustomerForm.name.trim()) {
      alert("Please enter a customer name.");
      return;
    }
    setSavingCustomer(true);
    const { data, error: insertErr } = await supabase
      .from("customers")
      .insert({
        name: newCustomerForm.name.trim(),
        category: newCustomerForm.category,
        discount_pct: newCustomerForm.discount_pct,
        payment_terms: "7 Days",
      })
      .select()
      .single();
    setSavingCustomer(false);
    if (insertErr || !data) {
      alert(insertErr?.message || "Failed to create customer.");
      return;
    }
    const created = data as Customer;
    setCustomerList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setForm((f) => ({ ...f, customer_id: created.id, category: created.category || f.category }));
    setNewCustomerOpen(false);
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLineItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLineItems((prev) => [...prev, { part_id: "", qty_m2: 0, note: "", sort_order: prev.length }]);
  }

  function removeLine(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const isSupplyOnly = form.job_type === "SUPPLY ONLY";

  // Every customer can carry a standing discount % on their record — this was being
  // captured but never actually applied to the quote math. Now it comes straight off
  // the line items, on top of (and separate from) any manual discount/markup below.
  const selectedCustomer = customerList.find((c) => c.id === form.customer_id);
  const customerDiscountPct = selectedCustomer?.discount_pct || 0;

  const computedLines = lineItems.map((l) => {
    const part = partById[l.part_id || ""];
    const c = computeLine(part, l.qty_m2, form.price_tier || null);
    const tierMissing = isSupplyOnly && !!part && tierPriceMissing(part, form.price_tier || null);
    const grossCharge = isSupplyOnly ? c.supplyOnlyCharge : c.supplyInstallCharge;
    const discountAmount = grossCharge * (customerDiscountPct / 100);
    return { ...l, ...c, grossCharge, discountAmount, tierMissing };
  });
  const materialCost = computedLines.reduce((s, l) => s + l.materialCost, 0);
  const labourCost = isSupplyOnly ? 0 : computedLines.reduce((s, l) => s + l.labourCost, 0);
  const chargeBeforeMarkup = computedLines.reduce((s, l) => s + l.grossCharge, 0);
  const customerDiscountTotal = computedLines.reduce((s, l) => s + l.discountAmount, 0);
  const adjustmentAmount =
    adjustMode === "percent" ? Math.round(chargeBeforeMarkup * (adjustPercent / 100) * 100) / 100 : Number(form.quote_markup || 0);
  const subtotal = chargeBeforeMarkup - customerDiscountTotal + adjustmentAmount;
  const gst = subtotal * 0.1;
  const total = subtotal + gst;
  const profit = subtotal - materialCost - labourCost;
  const marginPct = subtotal ? (profit / subtotal) * 100 : 0;

  async function save() {
    if (!form.customer_id) {
      setError("Please select a customer.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      customer_id: form.customer_id,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      job_type: form.job_type,
      category: form.category || null,
      outcome: form.outcome,
      lot_no: form.lot_no || null,
      address: form.address || null,
      suburb: form.suburb || null,
      entry_date: form.entry_date,
      notes: form.notes || null,
      quote_markup: adjustmentAmount,
      show_qty_on_quote: form.show_qty_on_quote,
      price_tier: form.job_type === "SUPPLY ONLY" && form.price_tier ? form.price_tier : null,
    };

    let projectId = project?.id;
    let quoteNumberForLabel = project?.quote_number;

    if (isNew) {
      const { data, error: insertErr } = await supabase.from("projects").insert(payload).select().single();
      if (insertErr || !data) {
        setError(insertErr?.message || "Failed to create quote.");
        setSaving(false);
        return;
      }
      projectId = data.id;
      quoteNumberForLabel = data.quote_number;
      if (prefill?.siteVisit) {
        await supabase.from("site_visits").update({ project_id: data.id, status: "Quoted" }).eq("id", prefill.siteVisit.id);
      }
      if (crmEnabled) {
        // Every new quote gets a CRM file (or joins the site visit's file) with follow-up calls.
        const { data: au } = await supabase.auth.getUser();
        const cust = customerList.find((c) => c.id === form.customer_id);
        if (au.user) {
          await ensureLead(
            supabase,
            {
              projectId: data.id,
              siteVisitId: prefill?.siteVisit?.id ?? null,
              customerId: form.customer_id || null,
              name: cust?.name || null,
              phone: (cust as any)?.contact_phone || null,
              email: (cust as any)?.contact_email || null,
              address: form.address,
              suburb: form.suburb,
              from: `quote Q${data.quote_number}`,
            },
            au.user.id
          );
        }
      }
    } else {
      const { error: updateErr } = await supabase.from("projects").update(payload).eq("id", projectId);
      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }
      // Clear existing lines, then re-insert the current set (simplest way to keep this in sync).
      await supabase.from("project_lines").delete().eq("project_id", projectId);
    }

    const rowsToInsert = lineItems
      .filter((l) => l.part_id)
      .map((l, idx) => ({
        project_id: projectId,
        part_id: l.part_id,
        qty_m2: Number(l.qty_m2) || 0,
        note: l.note || null,
        sort_order: idx,
      }));

    if (rowsToInsert.length > 0) {
      const { error: linesErr } = await supabase.from("project_lines").insert(rowsToInsert);
      if (linesErr) {
        setError(linesErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    const customerName = customerList.find((c) => c.id === form.customer_id)?.name || "—";
    logAudit(supabase, {
      eventType: isNew ? "create" : "update",
      entityType: "quote",
      entityId: projectId,
      entityLabel: `Q${quoteNumberForLabel} — ${customerName}`,
    });
    router.push(`/dashboard/quotes/${projectId}`);
    router.refresh();
  }

  async function toggleArchive() {
    if (!project) return;
    if (!project.archived && !confirm(`Archive quote Q${project.quote_number}?`)) return;
    await supabase.from("projects").update({ archived: !project.archived }).eq("id", project.id);
    logAudit(supabase, {
      eventType: project.archived ? "update" : "delete",
      entityType: "quote",
      entityId: project.id,
      entityLabel: `Q${project.quote_number}`,
      details: project.archived ? "Restored" : "Archived",
    });
    router.push("/dashboard/quotes");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/quotes" className="text-sm text-[var(--muted)] hover:underline">
            &larr; Quotes
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {isNew ? "New quote" : `Quote Q${project!.quote_number}`}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && isAdmin && (
            <button onClick={toggleArchive} className="text-sm text-[var(--muted)] hover:underline">
              {project!.archived ? "Restore" : "Archive"}
            </button>
          )}
          {!isNew && (
            <Link
              href={`/dashboard/quotes/${project!.id}/print`}
              target="_blank"
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Print preview
            </Link>
          )}
          {!isNew && project!.share_token && (
            <button
              onClick={copyCustomerLink}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              {linkCopied ? "Link copied!" : "Copy customer link"}
            </button>
          )}
          {!isNew && project!.share_token && (
            <button
              onClick={() => {
                setEmailOpen(true);
                setEmailSent(false);
                setEmailError("");
              }}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Email to customer
            </button>
          )}
          {!isNew && (
            <Link
              href={`/dashboard/work-orders/new?project_id=${project!.id}`}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              Create work order
            </Link>
          )}
          {!isNew && (isAdmin || crmEnabled) && project!.outcome === "Accepted" && (
            <Link
              href={`/dashboard/invoices/new?project_id=${project!.id}`}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Create invoice
            </Link>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save quote"}
          </button>
        </div>
      </div>

      {crmEnabled && !isNew && (
        <div className="mt-5 flex gap-1 border-b border-[var(--border)]">
          {([["details", "Quote"], ["crm", "CRM"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-[var(--brand-gold-dark)] text-[#201f1c]" : "border-transparent text-[var(--muted)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {crmEnabled && !isNew && tab === "crm" && (
        <CrmPanel
          mode="record"
          seed={{
            projectId: project!.id,
            customerId: form.customer_id || null,
            name: selectedCustomer?.name || null,
            phone: (selectedCustomer as any)?.contact_phone || null,
            email: (selectedCustomer as any)?.contact_email || null,
            address: form.address,
            suburb: form.suburb,
            from: `quote Q${project!.quote_number}`,
          }}
        />
      )}

      <div className={tab === "crm" ? "hidden" : ""}>
      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      {isNew && prefill && (
        <div className="mt-4 rounded-lg border border-[#f3d48a] bg-[#fff8e6] px-4 py-2 text-sm text-[#5c430b]">
          Started from{" "}
          <Link href={`/dashboard/site-visits/${prefill.siteVisit.id}`} className="font-semibold underline">
            site visit SV{prefill.siteVisit.visit_number}
          </Link>
          . Address, contact and measured m² are filled in
          {prefill.customer_id ? "" : ` — pick or add the customer (“+ Add new customer” starts with ${prefill.customer_name || "the visit's name"})`}
          {prefill.lines.some((l) => !l.part_id) ? ", and choose the product on any line left blank" : ""}.
        </div>
      )}

      {!isNew && project!.accepted_at && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">
          <span>✓</span>
          <span>
            Accepted online by <strong>{project!.accepted_name}</strong> on{" "}
            {new Date(project!.accepted_at).toLocaleString("en-AU")}
          </span>
        </div>
      )}

      {/* Header fields */}
      <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-[var(--border)] p-5 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Customer
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.customer_id}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="">Select customer...</option>
            {customerList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new__">+ Add new customer...</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Job type
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.job_type}
            onChange={(e) => setForm({ ...form, job_type: e.target.value })}
          >
            {JOB_TYPES.map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
        </label>
        {isSupplyOnly && (
          <label className="flex flex-col gap-1 text-sm">
            Price point
            <select
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.price_tier}
              onChange={(e) => setForm({ ...form, price_tier: e.target.value })}
            >
              <option value="">Standard (supply/pack)</option>
              {PRICE_TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Outcome
          <select
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.outcome}
            onChange={(e) => setForm({ ...form, outcome: e.target.value as Project["outcome"] })}
          >
            {OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Entry date
          <input
            type="date"
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.entry_date}
            onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Lot no.
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.lot_no}
            onChange={(e) => setForm({ ...form, lot_no: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Address
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Suburb
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.suburb}
            onChange={(e) => setForm({ ...form, suburb: e.target.value })}
          />
        </label>

        <p className="text-xs font-medium uppercase text-[var(--muted)] sm:col-span-3">
          Contact for this quote (not the customer's standing contact)
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Contact name
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contact phone
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contact email
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
          />
        </label>

        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input
            type="checkbox"
            checked={form.show_qty_on_quote}
            onChange={(e) => setForm({ ...form, show_qty_on_quote: e.target.checked })}
          />
          Show m² quantities to the customer on the printed quote
          <span className="text-xs font-normal text-[var(--muted)]">
            (off by default — hides exact measurements so the quote can&apos;t be easily shopped around)
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-3">
          Notes
          <textarea
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
      </div>

      {/* Line items */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Line items</h2>
          <button onClick={addLine} className="text-sm text-accent hover:underline">
            + Add line
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Qty (m²)</th>
                <th className="px-3 py-2">Packs</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2 text-right">Charge</th>
                <th className="px-3 py-2 text-right">Cust. discount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {computedLines.map((l, idx) => (
                <tr key={idx} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <select
                      className="rounded-lg border border-[var(--border)] px-2 py-1.5"
                      value={l.part_id || ""}
                      onChange={(e) => updateLine(idx, { part_id: e.target.value })}
                    >
                      <option value="">Select product...</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 rounded-lg border border-[var(--border)] px-2 py-1.5"
                      value={l.qty_m2}
                      onChange={(e) => updateLine(idx, { qty_m2: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--muted)]">{l.packs}</td>
                  <td className="px-3 py-2">
                    <input
                      className="w-[28rem] max-w-full rounded-lg border border-[var(--border)] px-2 py-1.5"
                      value={l.note || ""}
                      onChange={(e) => updateLine(idx, { note: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {fmtCurrency(l.grossCharge)}
                    {isSupplyOnly && l.part_id && partById[l.part_id] && (
                      <div className="text-xs font-normal text-[var(--muted)]">
                        {fmtCurrency(supplyPackPrice(partById[l.part_id], form.price_tier || null))}/pack · {tierLabel(form.price_tier || null)}
                      </div>
                    )}
                    {l.tierMissing && (
                      <div className="text-xs font-normal text-amber-700">
                        No {tierLabel(form.price_tier).toLowerCase()} price set — using standard
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--muted)]">
                    {customerDiscountPct > 0 ? `-${fmtCurrency(l.discountAmount)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => removeLine(idx)} className="text-[var(--muted)] hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discount / markup */}
      <div className="mt-6 rounded-xl border border-[var(--border)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Discount / markup</h2>
          <div className="flex items-center rounded-lg border border-[var(--border)] p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setAdjustMode("amount")}
              className={`rounded-md px-3 py-1 font-medium ${
                adjustMode === "amount" ? "bg-accent text-white" : "text-[var(--muted)]"
              }`}
            >
              $ Amount
            </button>
            <button
              type="button"
              onClick={() => setAdjustMode("percent")}
              className={`rounded-md px-3 py-1 font-medium ${
                adjustMode === "percent" ? "bg-accent text-white" : "text-[var(--muted)]"
              }`}
            >
              % Percent
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          A positive number adds a markup on top of the line items below; a negative number applies a
          discount.
        </p>

        <div className="mt-3 flex items-end gap-4">
          {adjustMode === "amount" ? (
            <label className="flex flex-col gap-1 text-sm">
              Adjustment ($, can be negative)
              <input
                type="number"
                step="0.01"
                className="w-48 rounded-lg border border-[var(--border)] px-3 py-2"
                value={form.quote_markup}
                onChange={(e) => setForm({ ...form, quote_markup: Number(e.target.value) })}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              Adjustment (%, can be negative)
              <input
                type="number"
                step="0.1"
                className="w-48 rounded-lg border border-[var(--border)] px-3 py-2"
                value={adjustPercent}
                onChange={(e) => setAdjustPercent(Number(e.target.value))}
              />
            </label>
          )}
          <div className="pb-2 text-sm text-[var(--muted)]">
            = <span className="font-medium text-[var(--text)]">{fmtCurrency(adjustmentAmount)}</span>{" "}
            {adjustmentAmount >= 0 ? "markup" : "discount"}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="mt-6 grid grid-cols-2 gap-6 rounded-xl border border-[var(--border)] p-5 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Line items</div>
          <div className="text-lg font-semibold">{fmtCurrency(chargeBeforeMarkup)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">
            Customer discount{customerDiscountPct > 0 ? ` (${customerDiscountPct}%)` : ""}
          </div>
          <div className={`text-lg font-semibold ${customerDiscountTotal > 0 ? "text-red-700" : ""}`}>
            {customerDiscountTotal > 0 ? `-${fmtCurrency(customerDiscountTotal)}` : fmtCurrency(0)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Discount / markup</div>
          <div className={`text-lg font-semibold ${adjustmentAmount < 0 ? "text-red-700" : ""}`}>
            {adjustmentAmount >= 0 ? "+" : ""}
            {fmtCurrency(adjustmentAmount)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Subtotal (ex GST)</div>
          <div className="text-lg font-semibold">{fmtCurrency(subtotal)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">GST — 10% on top</div>
          <div className="text-lg font-semibold">{fmtCurrency(gst)}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-[var(--muted)]">Total payable (inc GST)</div>
          <div className="text-lg font-bold text-accent">{fmtCurrency(total)}</div>
        </div>

        <div className="col-span-2 border-t border-[var(--border)] pt-4 sm:col-span-3 lg:col-span-6">
          <p className="mb-2 text-xs font-medium uppercase text-[var(--muted)]">
            Internal only — not shown to the customer
          </p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Material cost</div>
              <div className="font-medium">{fmtCurrency(materialCost)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Labour cost</div>
              <div className="font-medium">{fmtCurrency(labourCost)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Profit</div>
              <div className="font-medium">{fmtCurrency(profit)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--muted)]">Margin</div>
              <div className="font-medium">{marginPct.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {newCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="text-lg font-bold">Add new customer</h3>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Name
                <input
                  autoFocus
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Category
                <select
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={newCustomerForm.category}
                  onChange={(e) =>
                    setNewCustomerForm({ ...newCustomerForm, category: e.target.value as Customer["category"] })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Discount %
                <input
                  type="number"
                  step="0.1"
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                  value={newCustomerForm.discount_pct}
                  onChange={(e) =>
                    setNewCustomerForm({ ...newCustomerForm, discount_pct: Number(e.target.value) })
                  }
                />
              </label>
              <p className="text-xs text-[var(--muted)]">
                You can fill in contact details, payment terms, etc. later from the Customers page.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setNewCustomerOpen(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveNewCustomer}
                disabled={savingCustomer}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingCustomer ? "Saving..." : "Add customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="text-lg font-bold">Email quote to customer</h3>
            {emailSent ? (
              <>
                <p className="mt-3 text-sm text-green-700">Sent to {emailAddress}.</p>
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={() => setEmailOpen(false)}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="mt-4 flex flex-col gap-1 text-sm">
                  Customer&apos;s email
                  <input
                    autoFocus
                    type="email"
                    className="rounded-lg border border-[var(--border)] px-3 py-2"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                  />
                </label>
                {emailError && <p className="mt-2 text-sm text-red-700">{emailError}</p>}
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    onClick={() => setEmailOpen(false)}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendQuoteEmail}
                    disabled={emailSending}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {emailSending ? "Sending..." : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
