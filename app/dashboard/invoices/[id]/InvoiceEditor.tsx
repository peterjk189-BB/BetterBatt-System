"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { supplyPackPrice, PRICE_TIERS } from "@/lib/priceTiers";
import { derivedStatus, fmtDate, invNo, invoiceTotals, money, paidTotal, PAY_METHODS, round2, round4, STATUS_STYLE, today, type Invoice, type InvoiceLine, type Payment } from "@/lib/invoices";
import { siteAddress } from "@/lib/siteAddress";
import { fmtSplit } from "@/lib/picking";

type Full = Invoice & {
  customers: { name: string; contact_email: string | null; accounts_contact_name?: string | null; accounts_contact_email?: string | null; accounts_contact_phone?: string | null } | null;
  projects: { id: string; quote_number: number; lot_no: string | null; address: string | null; suburb: string | null; contact_email: string | null } | null;
};

const input = "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

type PartOpt = { id: string; code: string | null; name: string; supply_charge_per_pack: number; price_retail: number | null; price_trade: number | null; price_regency: number | null; pack_cost_ex_gst?: number | null; supplier_id?: string | null; is_stock_item?: boolean | null; pack_per_multi?: number | null; stock_on_hand?: number | null };

export default function InvoiceEditor({ invoice, payments: initialPayments, initialLines, parts, suppliers = [], initialPoNumbers = {} }: { invoice: Full; payments: Payment[]; initialLines: InvoiceLine[]; parts: PartOpt[]; suppliers?: { id: string; name: string }[]; initialPoNumbers?: Record<string, string> }) {
  const supabase = createClient();
  const router = useRouter();
  const [inv, setInv] = useState<Full>(invoice);
  const [payments, setPayments] = useState(initialPayments);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [emailTo, setEmailTo] = useState(invoice.customers?.accounts_contact_email || invoice.customers?.contact_email || invoice.projects?.contact_email || "");
  const [lines, setLines] = useState<InvoiceLine[]>(initialLines);
  const [tier, setTier] = useState<string>("retail");
  const [partSearch, setPartSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editCust, setEditCust] = useState(false);
  const [custList, setCustList] = useState<{ id: string; name: string }[]>([]);
  const [custChoice, setCustChoice] = useState("");
  const [custName, setCustName] = useState("");
  const [discText, setDiscText] = useState<string | null>(null);
  const [poNumbers, setPoNumbers] = useState<Record<string, string>>(initialPoNumbers);
  const [fulfilMsg, setFulfilMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pay, setPay] = useState({ date: today(), amount: "", method: "Bank transfer", ref: "" });

  const draft = inv.status === "Draft";
  const paid = paidTotal(payments);
  const status = derivedStatus(inv, paid);
  const balance = Math.max(0, round2(inv.total - paid));

  const hasLines = lines.length > 0;
  // false until migration 0052 has been run in Supabase
  const hasDiscountCols = inv.discount_ex_gst !== undefined;
  const discountEx = Number(inv.discount_ex_gst || 0);
  const subtotalEx = round2(Number(inv.amount_ex_gst || 0) + discountEx);

  /** Items drive the invoice amount: ex GST = sum of lines, GST = 10%. */
  async function syncTotals(next: InvoiceLine[]) {
    const sub = round2(next.reduce((s, l) => s + Number(l.line_ex || 0), 0));
    const t = invoiceTotals(sub, inv.discount_type, inv.discount_value);
    await save(hasDiscountCols ? t : { amount_ex_gst: t.amount_ex_gst, gst: t.gst, total: t.total });
  }

  async function addItem(p: PartOpt) {
    const unit = round4(supplyPackPrice(p, tier === "standard" ? null : tier));
    const { data, error } = await supabase
      .from("invoice_lines")
      .insert({ invoice_id: inv.id, part_id: p.id, description: `${p.code ? p.code + " - " : ""}${p.name}`, qty: 1, unit_price: unit, line_ex: round2(unit), sort_order: lines.length })
      .select()
      .single();
    if (error || !data) return setMsg({ ok: false, text: (error?.message || "Could not add the item") + " (has migration 0033 been run?)" });
    const next = [...lines, data as InvoiceLine];
    setLines(next);
    setPartSearch("");
    await syncTotals(next);
  }

  // false until migration 0053 has been run in Supabase
  const hasFulfilCols = inv.delivery_method !== undefined;
  // false until migration 0054 has been run in Supabase
  const hasContactCols = inv.delivery_contact_name !== undefined;
  const isSupplierLine = (l: InvoiceLine) => (l.fulfilment ?? "warehouse") === "supplier";
  // Non-stock items (labour, delivery fees and the like) are never picked or ordered.
  const isStockLine = (l: InvoiceLine) => !!l.part_id && parts.find((p) => p.id === l.part_id)?.is_stock_item !== false;
  const warehouseLines = lines.filter((l) => isStockLine(l) && !isSupplierLine(l));
  const supplierToOrder = lines.filter((l) => isStockLine(l) && isSupplierLine(l) && !l.po_id);

  async function setFulfilment(l: InvoiceLine, value: "warehouse" | "supplier") {
    const { error } = await supabase.from("invoice_lines").update({ fulfilment: value }).eq("id", l.id);
    if (error) return setFulfilMsg({ ok: false, text: error.message + " (has migration 0053 been run?)" });
    setLines(lines.map((x) => (x.id === l.id ? { ...x, fulfilment: value } : x)));
  }

  // Picking from the warehouse, right on the invoice: multis (full multi-packs) and/or loose packs, same as the picking slip.
  const [pickEntry, setPickEntry] = useState<Record<string, { multi: string; pks: string }>>({});
  const [pickBusy, setPickBusy] = useState("");
  const perMulti = (l: InvoiceLine) => Number(parts.find((p) => p.id === l.part_id)?.pack_per_multi) || 0;

  async function pickLine(l: InvoiceLine) {
    const e = pickEntry[l.id] ?? { multi: "", pks: String(l.qty) };
    const multi = Number(e.multi) || 0;
    const pks = Number(e.pks) || 0;
    if (multi <= 0 && pks <= 0) return setFulfilMsg({ ok: false, text: "Enter how many multis and/or loose packs you picked." });
    setPickBusy(l.id);
    const { error } = await supabase.rpc("pick_invoice_line", { p_line_id: l.id, p_multi: multi, p_pks: pks });
    setPickBusy("");
    if (error) return setFulfilMsg({ ok: false, text: error.message + " (has migration 0053 been run?)" });
    setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, picked: true, multi_picked: multi, packs_picked: pks } : x)));
    setFulfilMsg({ ok: true, text: "Picked. Stock taken off inventory." });
  }

  async function undoPick(l: InvoiceLine) {
    setPickBusy(l.id);
    const { error } = await supabase.rpc("unpick_invoice_line", { p_line_id: l.id });
    setPickBusy("");
    if (error) return setFulfilMsg({ ok: false, text: error.message });
    setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, picked: false, multi_picked: null, packs_picked: null } : x)));
    setFulfilMsg({ ok: true, text: "Pick undone. Stock put back." });
  }

  /** Delivery / pick-up details save on their own, so they can still be changed after the invoice is sent. */
  async function saveDelivery() {
    setBusy("delivery");
    const { error } = await supabase
      .from("invoices")
      .update({
        delivery_method: inv.delivery_method ?? "delivery",
        delivery_date: inv.delivery_date || null,
        delivery_note: inv.delivery_note?.trim() || null,
        delivery_address: inv.delivery_address?.trim() || null,
        ...(hasContactCols
          ? { delivery_contact_name: inv.delivery_contact_name?.trim() || null, delivery_contact_phone: inv.delivery_contact_phone?.trim() || null, delivery_time: inv.delivery_time || null }
          : {}),
      })
      .eq("id", inv.id);
    setBusy("");
    if (error) return setFulfilMsg({ ok: false, text: error.message + " (has migration 0053 been run?)" });
    setFulfilMsg({ ok: true, text: "Delivery details saved." });
    logAudit(supabase, { eventType: "update", entityType: "invoice", entityId: inv.id, entityLabel: invNo(inv.invoice_number), details: "Delivery details updated" });
  }

  /** Draft purchase orders for the lines marked "Order from supplier", one per supplier. */
  async function createPurchaseOrders() {
    setBusy("po");
    const groups = new Map<string, InvoiceLine[]>();
    for (const l of supplierToOrder) {
      const part = parts.find((p) => p.id === l.part_id);
      const key = part?.supplier_id || "";
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    const made: string[] = [];
    const nextNumbers = { ...poNumbers };
    let nextLines = lines;
    for (const [supplierId, ls] of Array.from(groups.entries())) {
      const { data: po, error } = await supabase
        .from("purchase_orders")
        .insert({
          supplier_id: supplierId || null,
          status: "Draft",
          delivery_address: inv.delivery_address?.trim() || inv.site_address?.trim() || null,
          delivery_date: inv.delivery_date || null,
          notes: `For ${invNo(inv.invoice_number)}${inv.customers?.name ? ` - ${inv.customers.name}` : ""}`,
        })
        .select("id, po_number")
        .single();
      if (error || !po) {
        setBusy("");
        return setFulfilMsg({ ok: false, text: error?.message || "Could not create the purchase order" });
      }
      const rows = ls.map((l) => {
        const part = parts.find((p) => p.id === l.part_id);
        return { purchase_order_id: po.id, part_id: l.part_id, qty_multi: 0, qty_pks: Number(l.qty) || 0, unit_cost: part?.pack_cost_ex_gst ?? null };
      });
      const { error: lineErr } = await supabase.from("purchase_order_lines").insert(rows);
      if (lineErr) {
        setBusy("");
        return setFulfilMsg({ ok: false, text: lineErr.message });
      }
      await supabase.from("invoice_lines").update({ po_id: po.id }).in("id", ls.map((l) => l.id));
      nextLines = nextLines.map((x) => (ls.some((l) => l.id === x.id) ? { ...x, po_id: po.id } : x));
      nextNumbers[po.id] = po.po_number || "PO";
      made.push(`${po.po_number || "PO"}${supplierId ? ` (${suppliers.find((s) => s.id === supplierId)?.name ?? "supplier"})` : " (no supplier set)"}`);
    }
    setLines(nextLines);
    setPoNumbers(nextNumbers);
    setBusy("");
    setFulfilMsg({ ok: true, text: `Created draft ${made.length === 1 ? "purchase order" : "purchase orders"}: ${made.join(", ")}. Open Purchase Orders to review and send.` });
    logAudit(supabase, { eventType: "create", entityType: "invoice", entityId: inv.id, entityLabel: invNo(inv.invoice_number), details: `Draft purchase orders created: ${made.join(", ")}` });
  }

  async function changeLine(l: InvoiceLine, patch: Partial<InvoiceLine>) {
    const merged = { ...l, ...patch };
    merged.line_ex = round2(Number(merged.qty || 0) * Number(merged.unit_price || 0));
    const { error } = await supabase.from("invoice_lines").update({ description: merged.description, qty: merged.qty, unit_price: merged.unit_price, line_ex: merged.line_ex }).eq("id", l.id);
    if (error) return setMsg({ ok: false, text: error.message });
    const next = lines.map((x) => (x.id === l.id ? merged : x));
    setLines(next);
    await syncTotals(next);
  }

  /** Changing the price point re-prices the inventory lines already on the draft. */
  async function changeTier(nextTier: string) {
    setTier(nextTier);
    if (!draft) return;
    const priced = lines.filter((l) => l.part_id && parts.some((p) => p.id === l.part_id));
    if (priced.length === 0) return;
    const next: InvoiceLine[] = [];
    for (const l of lines) {
      const part = l.part_id ? parts.find((p) => p.id === l.part_id) : undefined;
      if (!part) {
        next.push(l);
        continue;
      }
      const unit = round4(supplyPackPrice(part, nextTier === "standard" ? null : nextTier));
      const merged = { ...l, unit_price: unit, line_ex: round2(Number(l.qty || 0) * unit) };
      const { error } = await supabase.from("invoice_lines").update({ unit_price: merged.unit_price, line_ex: merged.line_ex }).eq("id", l.id);
      if (error) return setMsg({ ok: false, text: error.message });
      next.push(merged);
    }
    setLines(next);
    await syncTotals(next);
    setMsg({ ok: true, text: `Re-priced ${priced.length} line${priced.length === 1 ? "" : "s"} to the ${PRICE_TIERS.find((t) => t.value === nextTier)?.label ?? nextTier} price point.` });
  }

  async function removeLine(l: InvoiceLine) {
    const { error } = await supabase.from("invoice_lines").delete().eq("id", l.id);
    if (error) return setMsg({ ok: false, text: error.message });
    const next = lines.filter((x) => x.id !== l.id);
    setLines(next);
    await syncTotals(next);
  }

  const matches = parts
    .filter((p) => !partSearch.trim() || `${p.code ?? ""} ${p.name}`.toLowerCase().includes(partSearch.toLowerCase().trim()))
    .slice()
    .sort((x, y) => `${x.code ?? ""} ${x.name}`.localeCompare(`${y.code ?? ""} ${y.name}`));

  async function save(patch: Partial<Invoice>, note?: string) {
    setBusy("save");
    const { data, error } = await supabase.from("invoices").update(patch).eq("id", inv.id).select("*, customers(*), projects(id, quote_number, lot_no, address, suburb, contact_email)").single();
    setBusy("");
    if (error || !data) return setMsg({ ok: false, text: error?.message || "Could not save" });
    // keep any delivery details typed but not yet saved (they have their own Save button)
    setInv((prev) => ({ ...(data as any), delivery_method: prev.delivery_method !== undefined ? prev.delivery_method : (data as any).delivery_method, delivery_date: prev.delivery_date !== undefined ? prev.delivery_date : (data as any).delivery_date, delivery_note: prev.delivery_note !== undefined ? prev.delivery_note : (data as any).delivery_note, delivery_contact_name: prev.delivery_contact_name !== undefined ? prev.delivery_contact_name : (data as any).delivery_contact_name, delivery_contact_phone: prev.delivery_contact_phone !== undefined ? prev.delivery_contact_phone : (data as any).delivery_contact_phone, delivery_time: prev.delivery_time !== undefined ? prev.delivery_time : (data as any).delivery_time }));
    if (note) {
      setMsg({ ok: true, text: note });
      logAudit(supabase, { eventType: "update", entityType: "invoice", entityId: inv.id, entityLabel: invNo(inv.invoice_number), details: note });
    }
  }

  function setAmounts(exText: string) {
    // The typed figure is the amount before any discount.
    setInv({ ...inv, ...invoiceTotals(Number(exText) || 0, inv.discount_type, inv.discount_value) });
  }

  function setDiscount(patch: { discount_type?: "amount" | "percent"; discount_value?: number; discount_label?: string }) {
    const next = { ...inv, ...patch };
    setInv({ ...next, ...invoiceTotals(subtotalEx, next.discount_type, next.discount_value) });
  }

  async function saveDetails() {
    await save(
      {
        description: inv.description,
        amount_ex_gst: inv.amount_ex_gst,
        gst: inv.gst,
        total: inv.total,
        ...(hasDiscountCols
          ? {
              discount_type: inv.discount_type ?? "amount",
              discount_value: Math.abs(Number(inv.discount_value) || 0) < 0.001 ? 0 : Number(inv.discount_value),
              discount_ex_gst: discountEx,
              discount_label: inv.discount_label?.trim() || null,
            }
          : {}),
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        customer_po: inv.customer_po,
        site_address: inv.site_address ?? null,
        ...(inv.delivery_address !== undefined ? { delivery_address: inv.delivery_address?.trim() || null } : {}),
        notes: inv.notes,
        qb_ref: inv.qb_ref,
      },
      "Saved."
    );
  }

  async function openEditCustomer() {
    setCustChoice((inv as any).customer_id ?? "");
    setCustName(inv.customers?.name ?? "");
    setEditCust(true);
    if (custList.length === 0) {
      const { data } = await supabase.from("customers").select("id, name").eq("archived", false).order("name");
      setCustList((data ?? []) as any);
    }
  }

  async function saveCustomer() {
    const currentId = (inv as any).customer_id ?? "";
    if (custChoice && custChoice !== currentId) {
      await save({ customer_id: custChoice } as any, "Customer changed.");
    } else if (currentId && custName.trim() && custName.trim() !== (inv.customers?.name ?? "")) {
      const { error } = await supabase.from("customers").update({ name: custName.trim() }).eq("id", currentId);
      if (error) return setMsg({ ok: false, text: error.message });
      logAudit(supabase, { eventType: "update", entityType: "customer", entityId: currentId, entityLabel: custName.trim(), details: "Renamed from invoice " + invNo(inv.invoice_number) });
      setInv({ ...inv, customers: { ...(inv.customers as any), name: custName.trim() } } as any);
      setMsg({ ok: true, text: "Customer name updated." });
    }
    setEditCust(false);
  }

  async function emailIt() {
    setBusy("email");
    setMsg(null);
    const res = await fetch("/api/invoices/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: inv.id, to: emailTo }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: j.error || "Could not send" });
    setInv({ ...inv, status: inv.status === "Draft" ? "Sent" : inv.status, sent_at: new Date().toISOString() });
    setMsg({ ok: true, text: `Emailed to ${emailTo} and marked as sent.` });
    logAudit(supabase, { eventType: "update", entityType: "invoice", entityId: inv.id, entityLabel: invNo(inv.invoice_number), details: `Emailed to ${emailTo}` });
  }

  async function addPayment() {
    const amount = round2(Number(pay.amount) || 0);
    if (amount <= 0) return setMsg({ ok: false, text: "Enter the amount received." });
    setBusy("pay");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("invoice_payments")
      .insert({ invoice_id: inv.id, paid_on: pay.date, amount, method: pay.method, reference: pay.ref.trim() || null, created_by: user?.id ?? null })
      .select()
      .single();
    setBusy("");
    if (error || !data) return setMsg({ ok: false, text: error?.message || "Could not record payment" });
    setPayments([...payments, data as Payment]);
    setPay({ ...pay, amount: "", ref: "" });
    setMsg({ ok: true, text: `Payment of ${money(amount)} recorded.` });
    logAudit(supabase, { eventType: "create", entityType: "invoice_payment", entityId: inv.id, entityLabel: invNo(inv.invoice_number), details: `${money(amount)} ${pay.method}` });
  }

  async function removePayment(p: Payment) {
    if (!confirm(`Remove the ${money(p.amount)} payment?`)) return;
    const { error } = await supabase.from("invoice_payments").delete().eq("id", p.id);
    if (error) return setMsg({ ok: false, text: error.message });
    setPayments(payments.filter((x) => x.id !== p.id));
  }

  async function voidIt() {
    if (!confirm("Void this invoice? It stays on record but no longer counts as owing.")) return;
    await save({ status: "Void" }, "Invoice voided. (If it was already imported into QuickBooks, void it there too.)");
  }

  async function deleteIt() {
    if (!confirm("Delete this draft invoice permanently?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) return setMsg({ ok: false, text: error.message });
    router.push("/dashboard/invoices");
  }

  return (
    <div className="w-full max-w-[1600px]">
      <Link href="/dashboard/invoices" className="text-sm text-[var(--muted)] hover:underline">← Invoices</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{invNo(inv.invoice_number)}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{status}</span>
        {inv.qb_exported_at && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">In QuickBooks export {fmtDate(inv.qb_exported_at.slice(0, 10))}</span>}
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {inv.customers?.name || "No customer"}
        {inv.projects && (
          <>
            {" · "}
            <Link href={`/dashboard/quotes/${inv.projects.id}`} className="text-accent hover:underline">Q{inv.projects.quote_number}</Link>
            {siteAddress(inv.projects) ? ` · ${siteAddress(inv.projects)}` : ""}
          </>
        )}
      </p>

      {msg && <p className={`mt-3 rounded-lg p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-[#fde8e8] text-[#b91c1c]"}`}>{msg.text}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/dashboard/invoices/${inv.id}/pdf`} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">View / download PDF</Link>
        {draft && (
          <button onClick={() => save({ status: "Sent", sent_at: new Date().toISOString() }, "Marked as sent.")} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">
            Mark as sent (without emailing)
          </button>
        )}
        {inv.status !== "Void" && !draft && (
          <button onClick={() => save({ status: "Draft" }, "Back to draft.")} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)]">Back to draft</button>
        )}
        {inv.status !== "Void" && <button onClick={voidIt} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700">Void</button>}
        {draft && <button onClick={deleteIt} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700">Delete draft</button>}
        {draft && <button onClick={() => (editCust ? setEditCust(false) : openEditCustomer())} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">{editCust ? "Close edit" : "Edit"}</button>}
      </div>

      <div className={`mt-5 grid items-start gap-5 ${hasFulfilCols ? "xl:grid-cols-2" : ""}`}>
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="rounded-lg bg-black/[0.03] p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Bill to</p>
          <p className="text-base font-semibold">{inv.customers?.name || "No customer"}</p>
          {(inv as any).customers?.contact_email && <p className="text-[var(--muted)]">{(inv as any).customers.contact_email}</p>}
          {(inv.customers?.accounts_contact_email || inv.customers?.accounts_contact_name || inv.customers?.accounts_contact_phone) ? (
            <p className="mt-1 text-[var(--muted)]">
              <span className="font-medium">Accounts:</span>{" "}
              {[inv.customers?.accounts_contact_name, inv.customers?.accounts_contact_email, inv.customers?.accounts_contact_phone].filter(Boolean).join(" · ")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-700">No accounts contact on this customer. Add one on the Customers page so invoices go to the right place.</p>
          )}
          {editCust && (
            <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
              <label className="block text-sm">
                Change customer on this invoice
                <select className={input} value={custChoice} onChange={(e) => setCustChoice(e.target.value)}>
                  <option value="">Choose...</option>
                  {custList.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </label>
              {custChoice === ((inv as any).customer_id ?? "") && (
                <label className="block text-sm">
                  Customer name <span className="text-xs text-[var(--muted)]">(renaming changes it everywhere this customer appears, not just this invoice)</span>
                  <input className={input} value={custName} onChange={(e) => setCustName(e.target.value)} />
                </label>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={saveCustomer} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">Save customer</button>
                <button type="button" onClick={() => setEditCust(false)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">Cancel</button>
              </div>
            </div>
          )}
          {inv.projects && (
            <p className="text-[var(--muted)]">
              <Link href={`/dashboard/quotes/${inv.projects.id}`} className="text-accent hover:underline">Q{inv.projects.quote_number}</Link>
              {siteAddress(inv.projects) ? ` · ${siteAddress(inv.projects)}` : ""}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Site address {!inv.site_address && inv.projects && <span className="text-xs text-[var(--muted)]">(blank = quote&apos;s address)</span>}
            <textarea className={input} rows={2} value={inv.site_address ?? ""} onChange={(e) => setInv({ ...inv, site_address: e.target.value })} placeholder="Lot, street, suburb" />
          </label>
          <label className="block text-sm">
            Delivery address <span className="text-xs text-[var(--muted)]">(printed as &quot;Deliver to&quot;)</span>
            <textarea className={input} rows={2} value={inv.delivery_address ?? ""} onChange={(e) => setInv({ ...inv, delivery_address: e.target.value })} placeholder="Street, suburb, state, postcode" />
          </label>
        </div>
        <label className="block text-sm">
          Description
          <input className={input} value={inv.description ?? ""} onChange={(e) => setInv({ ...inv, description: e.target.value })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">Invoice date<input type="date" className={input} value={inv.invoice_date} onChange={(e) => setInv({ ...inv, invoice_date: e.target.value })} /></label>
          <label className="block text-sm">Due date<input type="date" className={input} value={inv.due_date ?? ""} onChange={(e) => setInv({ ...inv, due_date: e.target.value || null })} /></label>
          <label className="block text-sm">Customer PO<input className={input} value={inv.customer_po ?? ""} onChange={(e) => setInv({ ...inv, customer_po: e.target.value })} /></label>
        </div>
      </div>
        {hasFulfilCols ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Delivery and fulfilment</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">The date shows on the Calendar, and on any purchase order raised here. Set each item below to come from the warehouse or the supplier.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              Delivery or pick-up
              <select className={input} value={inv.delivery_method ?? "delivery"} onChange={(e) => setInv({ ...inv, delivery_method: e.target.value as "delivery" | "pickup" })}>
                <option value="delivery">We deliver</option>
                <option value="pickup">Customer picks up</option>
              </select>
            </label>
            <label className="block text-sm">
              Date
              <input type="date" className={input} value={inv.delivery_date ?? ""} onChange={(e) => setInv({ ...inv, delivery_date: e.target.value || null })} />
            </label>
            <label className="block text-sm">
              Note <span className="text-xs text-[var(--muted)]">(time, gate code, who to call)</span>
              <input className={input} value={inv.delivery_note ?? ""} onChange={(e) => setInv({ ...inv, delivery_note: e.target.value })} />
            </label>
          </div>
          {hasContactCols ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm">
                Time
                <input type="time" className={input} value={inv.delivery_time ?? ""} onChange={(e) => setInv({ ...inv, delivery_time: e.target.value || null })} />
              </label>
              <label className="block text-sm">
                Site contact <span className="text-xs text-[var(--muted)]">(if not the customer)</span>
                <input className={input} value={inv.delivery_contact_name ?? ""} onChange={(e) => setInv({ ...inv, delivery_contact_name: e.target.value })} placeholder="Name" />
              </label>
              <label className="block text-sm">
                Site contact phone
                <input className={input} inputMode="tel" value={inv.delivery_contact_phone ?? ""} onChange={(e) => setInv({ ...inv, delivery_contact_phone: e.target.value })} placeholder="04.." />
              </label>
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-700">Delivery time and site contact need migration 0054 to be run in Supabase first.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={saveDelivery} disabled={busy === "delivery"} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Save delivery</button>
          </div>
        </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Inventory items</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Add materials you&apos;re selling on this invoice. Once there are items, the invoice amount is the total of the items. Prices are per pack, ex GST.</p>
        {lines.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--muted)]">
                <tr><th className="min-w-[22rem] py-1 pr-2">Item</th><th className="w-20 px-2">Qty</th><th className="w-32 px-2">Pack price inc GST</th><th className="w-28 px-2 text-right">Amount ex GST</th>{hasFulfilCols && <th className="w-52 px-2">From</th>}<th></th></tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-[var(--border)]">
                    <td className="py-1 pr-2">
                      {draft ? <input className="w-full rounded border border-[var(--border)] bg-white px-2 py-1" value={l.description} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, description: e.target.value } : x)))} onBlur={() => changeLine(l, { description: l.description })} /> : l.description}
                    </td>
                    <td className="px-2">
                      {draft ? <input className="w-full rounded border border-[var(--border)] bg-white px-2 py-1" inputMode="decimal" defaultValue={l.qty} onBlur={(e) => Number(e.target.value) !== Number(l.qty) && changeLine(l, { qty: Number(e.target.value) || 0 })} /> : l.qty}
                    </td>
                    <td className="px-2">
                      {draft ? <input key={`${l.id}-${l.unit_price}`} className="w-full rounded border border-[var(--border)] bg-white px-2 py-1" inputMode="decimal" defaultValue={round2(Number(l.unit_price) * 1.1).toFixed(2)} onBlur={(e) => { const inc = Number(e.target.value) || 0; if (round2(inc) !== round2(Number(l.unit_price) * 1.1)) changeLine(l, { unit_price: round4(inc / 1.1) }); }} /> : money(round2(Number(l.unit_price) * 1.1))}
                    </td>
                    <td className="px-2 text-right">{money(l.line_ex)}</td>
                    {hasFulfilCols && (
                      <td className="px-2">
                        {isStockLine(l) ? (
                          <div>
                            <select className="w-full rounded border border-[var(--border)] bg-white px-1 py-1 text-xs" value={l.fulfilment ?? "warehouse"} onChange={(e) => setFulfilment(l, e.target.value as "warehouse" | "supplier")}>
                              <option value="warehouse">Warehouse (pick)</option>
                              <option value="supplier">Order from supplier</option>
                            </select>
                            {l.picked && <div className="mt-0.5 text-[11px] font-semibold text-green-700">✓ Picked</div>}
                            {l.po_id && <div className="mt-0.5 text-[11px] font-semibold text-blue-700"><Link href={`/dashboard/purchase-orders/${l.po_id}`} className="hover:underline">On {poNumbers[l.po_id] || "PO"}</Link></div>}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">{l.part_id ? "Non-stock" : "—"}</span>
                        )}
                      </td>
                    )}
                    <td className="text-right">{draft && <button onClick={() => removeLine(l)} className="text-xs text-red-700 underline">Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lines.length > 0 && (() => {
          const costOf = (l: InvoiceLine) => {
            const part = parts.find((x) => x.id === l.part_id);
            return part && part.pack_cost_ex_gst != null ? round2(Number(l.qty || 0) * Number(part.pack_cost_ex_gst)) : null;
          };
          const sales = round2(lines.reduce((a, l) => a + Number(l.line_ex || 0), 0) - discountEx);
          const costed = lines.filter((l) => costOf(l) !== null);
          const cost = round2(costed.reduce((a, l) => a + (costOf(l) as number), 0));
          const missing = lines.length - costed.length;
          const profit = round2(sales - cost);
          const margin = sales > 0 ? (profit / sales) * 100 : 0;
          return (
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-black/[0.03] p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Profit on this invoice (staff only, not on the customer copy)</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><div className="text-xs text-[var(--muted)]">Sales ex GST{discountEx !== 0 ? " (after adjustment)" : ""}</div><div className="font-semibold">{money(sales)}</div></div>
                <div><div className="text-xs text-[var(--muted)]">Cost ex GST</div><div className="font-semibold">{money(cost)}</div></div>
                <div><div className="text-xs text-[var(--muted)]">Profit</div><div className={`font-semibold ${profit < 0 ? "text-red-700" : "text-green-700"}`}>{money(profit)}</div></div>
                <div><div className="text-xs text-[var(--muted)]">Margin</div><div className={`font-semibold ${profit < 0 ? "text-red-700" : "text-green-700"}`}>{margin.toFixed(1)}%</div></div>
              </div>
              {missing > 0 && <p className="mt-2 text-xs text-amber-700">{missing} line{missing === 1 ? "" : "s"} with no inventory cost (custom lines or no pack cost set), counted at $0 cost.</p>}
              <p className="mt-1 text-xs text-[var(--muted)]">Cost = pack cost ex GST in Inventory × quantity.</p>
            </div>
          );
        })()}
        {draft ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                  placeholder="Type to search inventory (e.g. R2.5 wall)..."
                  value={partSearch}
                  onChange={(e) => { setPartSearch(e.target.value); setPickerOpen(true); }}
                  onFocus={() => setPickerOpen(true)}
                  onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && matches[0] && partSearch.trim()) { e.preventDefault(); addItem(matches[0]); setPickerOpen(false); }
                    if (e.key === "Escape") setPickerOpen(false);
                  }}
                />
                {pickerOpen && (
                  <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-lg">
                    {matches.length === 0 && <li className="px-3 py-2 text-sm text-[var(--muted)]">No matching items</li>}
                    {matches.slice(0, 40).map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); addItem(p); setPickerOpen(false); }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-black/5"
                        >
                          <span>{p.code ? `${p.code} · ` : ""}{p.name}</span>
                          <span className="shrink-0 text-xs text-[var(--muted)]">{money(supplyPackPrice(p, tier === "standard" ? null : tier))}</span>
                        </button>
                      </li>
                    ))}
                    {matches.length > 40 && <li className="px-3 py-2 text-xs text-[var(--muted)]">Showing 40 of {matches.length} - keep typing to narrow</li>}
                  </ul>
                )}
              </div>
              <select className="rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm" value={tier} onChange={(e) => changeTier(e.target.value)}>
                <option value="standard">Standard price</option>
                {PRICE_TIERS.map((t) => (<option key={t.value} value={t.value}>{t.label} price</option>))}
              </select>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">Tap an item in the list (or press Enter to add the top match). Changing the price point re-prices every inventory line already on the draft (a price left at $0 on the item falls back to Standard). You can still edit the price or quantity on a line afterwards.</p>
          </div>
        ) : (
          lines.length === 0 && <p className="mt-2 text-xs text-[var(--muted)]">No items on this invoice.</p>
        )}
      </div>

      {!hasFulfilCols && lines.length > 0 && (
        <p className="mt-5 text-xs text-amber-700">Warehouse / supplier and delivery options need migration 0053 to be run in Supabase first.</p>
      )}

      <div className={`mt-5 grid items-start gap-5 ${hasFulfilCols ? "xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""}`}>
        <div className="space-y-5">
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        {!hasDiscountCols ? (
          draft && <p className="text-xs text-amber-700">Discounts and extra charges need migration 0052 to be run in Supabase first.</p>
        ) : draft || discountEx !== 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-black/[0.03] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Discount or extra charge (before GST)</p>
            {draft ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-[6rem_8rem_8rem_1fr_auto] sm:items-end">
                <div className="text-sm">
                  <div>Direction</div>
                  <div className="mt-1 flex overflow-hidden rounded-lg border border-[var(--border)]">
                    <button type="button" title="Discount: takes money off" onClick={() => setDiscount({ discount_value: Math.abs(Number(inv.discount_value) || 0) })} className={`flex-1 px-3 py-2 text-base font-bold ${Number(inv.discount_value) >= 0 ? "bg-accent text-white" : "bg-white"}`}>&minus;</button>
                    <button type="button" title="Extra charge: adds money on" onClick={() => setDiscount({ discount_value: -Math.abs(Number(inv.discount_value) || 0) || -0.0001 })} className={`flex-1 px-3 py-2 text-base font-bold ${Number(inv.discount_value) < 0 ? "bg-accent text-white" : "bg-white"}`}>+</button>
                  </div>
                </div>
                <label className="block text-sm">
                  Type
                  <select className={input} value={inv.discount_type ?? "amount"} onChange={(e) => setDiscount({ discount_type: e.target.value as "amount" | "percent" })}>
                    <option value="amount">Dollars ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                </label>
                <label className="block text-sm">
                  {inv.discount_type === "percent" ? "Percent" : "Dollars (ex GST)"}
                  <input
                    className={input}
                    inputMode="decimal"
                    value={discText ?? (Math.abs(Number(inv.discount_value) || 0) < 0.0001 ? "" : String(Math.abs(Number(inv.discount_value))))}
                    onBlur={() => setDiscText(null)}
                    onChange={(e) => {
                      // keep exactly what is typed (so "2." and "2.575" work); up to 3 decimal places
                      const txt = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.\d{0,3}).*$/, "$1");
                      setDiscText(txt);
                      const n = Math.abs(Number(txt) || 0);
                      setDiscount({ discount_value: Number(inv.discount_value) < 0 ? -n || -0.0001 : n });
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Label on the invoice
                  <input className={input} placeholder={discountEx < 0 ? "Adjustment" : "Discount"} value={inv.discount_label ?? ""} onChange={(e) => setDiscount({ discount_label: e.target.value })} />
                </label>
                <div className="pb-2 text-sm">
                  {discountEx > 0 ? <span className="font-semibold text-red-700">-{money(discountEx)}</span> : discountEx < 0 ? <span className="font-semibold text-green-700">+{money(-discountEx)}</span> : <span className="text-[var(--muted)]">None</span>}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm">{inv.discount_label || (discountEx < 0 ? "Adjustment" : "Discount")}{inv.discount_type === "percent" ? ` (${Math.abs(Number(inv.discount_value))}%)` : ""}: <span className={`font-semibold ${discountEx < 0 ? "text-green-700" : "text-red-700"}`}>{discountEx < 0 ? "+" : "-"}{money(Math.abs(discountEx))}</span> ex GST</p>
            )}
            {draft && <p className="mt-2 text-xs text-[var(--muted)]">Use &minus; for a discount and + for an extra charge (freight, call-out). It applies to the items total (or the amount) and GST is worked out on the result. Press Save below to keep it.</p>}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            {discountEx !== 0 ? "Amount before adjustment, ex GST" : "Amount ex GST"} {!draft ? <span className="text-xs text-[var(--muted)]">(locked once sent)</span> : hasLines ? <span className="text-xs text-[var(--muted)]">(from items above)</span> : null}
            <input className={input} inputMode="decimal" disabled={!draft || hasLines} value={subtotalEx} onChange={(e) => setAmounts(e.target.value)} />
          </label>
          <div className="text-sm">
            <p>GST</p>
            <p className="mt-1 py-2">{money(inv.gst)}</p>
          </div>
          <div className="text-sm">
            <p>Total inc GST</p>
            <p className="mt-1 py-2 text-lg font-bold">{money(inv.total)}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Notes (printed on the invoice)
            <textarea className={input} rows={2} value={inv.notes ?? ""} onChange={(e) => setInv({ ...inv, notes: e.target.value })} />
          </label>
          <label className="block text-sm">
            QuickBooks reference <span className="text-xs text-[var(--muted)]">(optional)</span>
            <input className={input} value={inv.qb_ref ?? ""} onChange={(e) => setInv({ ...inv, qb_ref: e.target.value })} />
          </label>
        </div>
        <button onClick={saveDetails} disabled={busy === "save"} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy === "save" ? "Saving..." : "Save changes"}
        </button>
      </div>
      {inv.status !== "Void" && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Email to customer</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="min-w-[16rem] flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" type="email" placeholder="customer@email.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
            <button onClick={emailIt} disabled={busy === "email" || !emailTo} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {busy === "email" ? "Sending..." : "Email invoice (PDF attached)"}
            </button>
          </div>
          {inv.sent_at && <p className="mt-2 text-xs text-[var(--muted)]">Last sent {new Date(inv.sent_at).toLocaleString("en-AU")}</p>}
        </div>
      )}

      {inv.status !== "Void" && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Payments</h2>
            <p className="text-sm">Paid {money(paid)} · <b>Balance {money(balance)}</b></p>
          </div>
          {payments.length > 0 && (
            <ul className="mt-2 divide-y divide-[var(--border)] text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span>{fmtDate(p.paid_on)} · {p.method || "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <span className="flex items-center gap-3">
                    <b>{money(p.amount)}</b>
                    <button onClick={() => removePayment(p)} className="text-xs text-red-700 underline">Remove</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            <input type="date" className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
            <input className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" inputMode="decimal" placeholder={`Amount (${balance.toFixed(2)})`} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            <select className="rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              {PAY_METHODS.map((m) => (<option key={m}>{m}</option>))}
            </select>
            <input className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" placeholder="Reference" value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} />
            <button onClick={addPayment} disabled={busy === "pay"} className="rounded-lg bg-[#201f1c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Record payment</button>
          </div>
          {balance > 0 && <button onClick={() => setPay({ ...pay, amount: balance.toFixed(2) })} className="mt-2 text-xs text-accent underline">Fill the full balance</button>}
        </div>
      )}
        </div>
        {hasFulfilCols ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Pick from warehouse</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Enter the multis and/or loose packs you picked off the shelf, then Mark picked. Stock comes off inventory.</p>
              {warehouseLines.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">No warehouse items. Set an item to &quot;Warehouse (pick)&quot; in the table above.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
                  {warehouseLines.map((l) => {
                    const part = parts.find((p) => p.id === l.part_id);
                    const ppm = perMulti(l);
                    const e = pickEntry[l.id] ?? { multi: "", pks: String(l.qty) };
                    const box = "w-16 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm text-black";
                    return (
                      <li key={l.id} className="py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium">{part?.name || l.description}</span>
                          <span className="text-xs text-[var(--muted)]">
                            need {Number(l.qty)} pack{Number(l.qty) === 1 ? "" : "s"}
                            {ppm > 1 ? ` · ${ppm} packs/multi` : ""}
                            {part?.stock_on_hand != null ? ` · stock ${Number(part.stock_on_hand)}` : ""}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {l.picked ? (
                            <>
                              <span className="font-semibold text-green-700">✓ {fmtSplit(Number(l.multi_picked) || 0, Number(l.packs_picked) || 0)}</span>
                              <button onClick={() => undoPick(l)} disabled={pickBusy === l.id} className="text-xs text-red-700 underline">Undo</button>
                            </>
                          ) : (
                            <>
                              {ppm > 1 && (
                                <>
                                  <span className="text-xs text-[var(--muted)]">Multis</span>
                                  <input
                                    className={box}
                                    inputMode="decimal"
                                    value={e.multi}
                                    onChange={(ev) => {
                                      const m = Number(ev.target.value) || 0;
                                      // the loose packs follow what is left after the multis; still editable
                                      setPickEntry({ ...pickEntry, [l.id]: { multi: ev.target.value, pks: String(Math.max(0, Number(l.qty) - m * ppm)) } });
                                    }}
                                  />
                                </>
                              )}
                              <span className="text-xs text-[var(--muted)]">Loose packs</span>
                              <input className={box} inputMode="decimal" value={e.pks} onChange={(ev) => setPickEntry({ ...pickEntry, [l.id]: { multi: e.multi, pks: ev.target.value } })} />
                              <button onClick={() => pickLine(l)} disabled={pickBusy === l.id} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-60">Mark picked</button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {warehouseLines.length > 0 && (
                <div className="mt-3">
                  <Link href={`/dashboard/invoices/${inv.id}/picking-slip`} className="inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
                    Picking slip ({warehouseLines.length} warehouse item{warehouseLines.length === 1 ? "" : "s"})
                  </Link>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Order from supplier</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Ordered in packs, so there is nothing to pick.</p>
              {lines.filter((l) => isStockLine(l) && isSupplierLine(l)).length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">No items set to &quot;Order from supplier&quot;.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
                  {lines.filter((l) => isStockLine(l) && isSupplierLine(l)).map((l) => (
                    <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                      <span className="font-medium">{parts.find((p) => p.id === l.part_id)?.name || l.description}</span>
                      <span className="text-xs">
                        <span className="text-[var(--muted)]">{Number(l.qty)} pack{Number(l.qty) === 1 ? "" : "s"}</span>
                        {l.po_id && (
                          <Link href={`/dashboard/purchase-orders/${l.po_id}`} className="ml-2 font-semibold text-blue-700 hover:underline">On {poNumbers[l.po_id] || "PO"}</Link>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {supplierToOrder.length > 0 && (
                <div className="mt-3">
                  <button onClick={createPurchaseOrders} disabled={busy === "po"} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-60">
                    {busy === "po" ? "Creating…" : `Create draft purchase order (${supplierToOrder.length} item${supplierToOrder.length === 1 ? "" : "s"})`}
                  </button>
                </div>
              )}
            </div>
            {fulfilMsg && <p className={`text-sm ${fulfilMsg.ok ? "text-green-700" : "text-red-700"}`}>{fulfilMsg.text}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
