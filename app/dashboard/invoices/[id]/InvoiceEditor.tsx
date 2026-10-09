"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { supplyPackPrice, PRICE_TIERS } from "@/lib/priceTiers";
import { derivedStatus, fmtDate, invNo, money, paidTotal, PAY_METHODS, round2, STATUS_STYLE, today, type Invoice, type InvoiceLine, type Payment } from "@/lib/invoices";
import { siteAddress } from "@/lib/siteAddress";

type Full = Invoice & {
  customers: { name: string; contact_email: string | null } | null;
  projects: { id: string; quote_number: number; lot_no: string | null; address: string | null; suburb: string | null; contact_email: string | null } | null;
};

const input = "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

type PartOpt = { id: string; code: string | null; name: string; supply_charge_per_pack: number; price_retail: number | null; price_trade: number | null; price_regency: number | null };

export default function InvoiceEditor({ invoice, payments: initialPayments, initialLines, parts }: { invoice: Full; payments: Payment[]; initialLines: InvoiceLine[]; parts: PartOpt[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [inv, setInv] = useState<Full>(invoice);
  const [payments, setPayments] = useState(initialPayments);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [emailTo, setEmailTo] = useState(invoice.customers?.contact_email || invoice.projects?.contact_email || "");
  const [lines, setLines] = useState<InvoiceLine[]>(initialLines);
  const [tier, setTier] = useState<string>("retail");
  const [partSearch, setPartSearch] = useState("");
  const [pay, setPay] = useState({ date: today(), amount: "", method: "Bank transfer", ref: "" });

  const draft = inv.status === "Draft";
  const paid = paidTotal(payments);
  const status = derivedStatus(inv, paid);
  const balance = Math.max(0, round2(inv.total - paid));

  const hasLines = lines.length > 0;

  /** Items drive the invoice amount: ex GST = sum of lines, GST = 10%. */
  async function syncTotals(next: InvoiceLine[]) {
    const ex = round2(next.reduce((s, l) => s + Number(l.line_ex || 0), 0));
    const gst = round2(ex * 0.1);
    await save({ amount_ex_gst: ex, gst, total: round2(ex + gst) });
  }

  async function addItem(p: PartOpt) {
    const unit = round2(supplyPackPrice(p, tier === "standard" ? null : tier));
    const { data, error } = await supabase
      .from("invoice_lines")
      .insert({ invoice_id: inv.id, part_id: p.id, description: `${p.code ? p.code + " - " : ""}${p.name}`, qty: 1, unit_price: unit, line_ex: unit, sort_order: lines.length })
      .select()
      .single();
    if (error || !data) return setMsg({ ok: false, text: (error?.message || "Could not add the item") + " (has migration 0033 been run?)" });
    const next = [...lines, data as InvoiceLine];
    setLines(next);
    setPartSearch("");
    await syncTotals(next);
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

  async function removeLine(l: InvoiceLine) {
    const { error } = await supabase.from("invoice_lines").delete().eq("id", l.id);
    if (error) return setMsg({ ok: false, text: error.message });
    const next = lines.filter((x) => x.id !== l.id);
    setLines(next);
    await syncTotals(next);
  }

  const matches = partSearch.trim().length >= 2
    ? parts.filter((p) => `${p.code ?? ""} ${p.name}`.toLowerCase().includes(partSearch.toLowerCase().trim())).slice(0, 8)
    : [];

  async function save(patch: Partial<Invoice>, note?: string) {
    setBusy("save");
    const { data, error } = await supabase.from("invoices").update(patch).eq("id", inv.id).select("*, customers(name, contact_email), projects(id, quote_number, lot_no, address, suburb, contact_email)").single();
    setBusy("");
    if (error || !data) return setMsg({ ok: false, text: error?.message || "Could not save" });
    setInv(data as any);
    if (note) {
      setMsg({ ok: true, text: note });
      logAudit(supabase, { eventType: "update", entityType: "invoice", entityId: inv.id, entityLabel: invNo(inv.invoice_number), details: note });
    }
  }

  function setAmounts(exText: string) {
    const ex = round2(Number(exText) || 0);
    const gst = round2(ex * 0.1);
    setInv({ ...inv, amount_ex_gst: ex, gst, total: round2(ex + gst) });
  }

  async function saveDetails() {
    await save(
      {
        description: inv.description,
        amount_ex_gst: inv.amount_ex_gst,
        gst: inv.gst,
        total: inv.total,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        customer_po: inv.customer_po,
        site_address: inv.site_address ?? null,
        notes: inv.notes,
        qb_ref: inv.qb_ref,
      },
      "Saved."
    );
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
    <div className="max-w-3xl">
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
        <a href={`/api/invoices/pdf?id=${inv.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">View / download PDF</a>
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
      </div>

      <div className="mt-5 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <label className="block text-sm">
          Site address {!inv.site_address && inv.projects && <span className="text-xs text-[var(--muted)]">(blank = uses the quote&apos;s address: {siteAddress(inv.projects)})</span>}
          <input className={input} value={inv.site_address ?? ""} onChange={(e) => setInv({ ...inv, site_address: e.target.value })} placeholder="Lot, street, suburb" />
        </label>
        <label className="block text-sm">
          Description
          <input className={input} value={inv.description ?? ""} onChange={(e) => setInv({ ...inv, description: e.target.value })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            Amount ex GST {!draft ? <span className="text-xs text-[var(--muted)]">(locked once sent)</span> : hasLines ? <span className="text-xs text-[var(--muted)]">(from items below)</span> : null}
            <input className={input} inputMode="decimal" disabled={!draft || hasLines} value={inv.amount_ex_gst} onChange={(e) => setAmounts(e.target.value)} />
          </label>
          <div className="text-sm">
            <p>GST</p>
            <p className="mt-1 py-2">{money(inv.gst)}</p>
          </div>
          <div className="text-sm">
            <p>Total inc GST</p>
            <p className="mt-1 py-2 font-bold">{money(inv.total)}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">Invoice date<input type="date" className={input} value={inv.invoice_date} onChange={(e) => setInv({ ...inv, invoice_date: e.target.value })} /></label>
          <label className="block text-sm">Due date<input type="date" className={input} value={inv.due_date ?? ""} onChange={(e) => setInv({ ...inv, due_date: e.target.value || null })} /></label>
          <label className="block text-sm">Customer PO<input className={input} value={inv.customer_po ?? ""} onChange={(e) => setInv({ ...inv, customer_po: e.target.value })} /></label>
        </div>
        <label className="block text-sm">
          Notes (printed on the invoice)
          <textarea className={input} rows={2} value={inv.notes ?? ""} onChange={(e) => setInv({ ...inv, notes: e.target.value })} />
        </label>
        <label className="block text-sm">
          QuickBooks reference <span className="text-xs text-[var(--muted)]">(optional, for your own tracking)</span>
          <input className={input} value={inv.qb_ref ?? ""} onChange={(e) => setInv({ ...inv, qb_ref: e.target.value })} />
        </label>
        <button onClick={saveDetails} disabled={busy === "save"} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy === "save" ? "Saving..." : "Save changes"}
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Inventory items</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Add materials you&apos;re selling on this invoice. Once there are items, the invoice amount is the total of the items. Prices are per pack, ex GST.</p>
        {lines.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--muted)]">
                <tr><th className="py-1 pr-2">Item</th><th className="w-20 px-2">Qty</th><th className="w-28 px-2">Unit ex GST</th><th className="w-28 px-2 text-right">Amount</th><th></th></tr>
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
                      {draft ? <input className="w-full rounded border border-[var(--border)] bg-white px-2 py-1" inputMode="decimal" defaultValue={l.unit_price} onBlur={(e) => Number(e.target.value) !== Number(l.unit_price) && changeLine(l, { unit_price: Number(e.target.value) || 0 })} /> : money(l.unit_price)}
                    </td>
                    <td className="px-2 text-right">{money(l.line_ex)}</td>
                    <td className="text-right">{draft && <button onClick={() => removeLine(l)} className="text-xs text-red-700 underline">Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {draft ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className="min-w-[14rem] flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" placeholder="Search inventory by code or name to add..." value={partSearch} onChange={(e) => setPartSearch(e.target.value)} />
              <select className="rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm" value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="standard">Standard price</option>
                {PRICE_TIERS.map((t) => (<option key={t.value} value={t.value}>{t.label} price</option>))}
              </select>
            </div>
            {matches.length > 0 && (
              <ul className="mt-1 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-white text-sm">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => addItem(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-black/[0.03]">
                      <span>{p.code ? `${p.code} · ` : ""}{p.name}</span>
                      <span className="shrink-0 text-[var(--muted)]">{money(supplyPackPrice(p, tier === "standard" ? null : tier))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-[var(--muted)]">The price point is picked when you add an item (a price left at $0 on the item falls back to Standard). You can edit the price or quantity on the line.</p>
          </div>
        ) : (
          lines.length === 0 && <p className="mt-2 text-xs text-[var(--muted)]">No items on this invoice.</p>
        )}
      </div>

      {inv.status !== "Void" && (
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
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
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
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
  );
}
