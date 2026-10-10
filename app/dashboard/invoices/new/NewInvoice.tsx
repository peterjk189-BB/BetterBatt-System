"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { dueFromTerms, KINDS, money, round2, today } from "@/lib/invoices";
import { siteAddress } from "@/lib/siteAddress";

type QuoteItem = {
  id: string;
  quote_number: number;
  lot_no: string | null;
  address: string | null;
  suburb: string | null;
  customer_id: string | null;
  customer_name: string;
  terms: string | null;
  quote_ex: number;
  invoiced_ex: number;
};

const input = "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

export default function NewInvoice({ quotes, customers: customersProp, initialProjectId, problems = [] }: { quotes: QuoteItem[]; customers: { id: string; name: string; payment_terms: string | null }[]; initialProjectId: string; problems?: string[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [customers, setCustomers] = useState(customersProp);
  const [customerId, setCustomerId] = useState("");
  const [newCust, setNewCust] = useState<null | { name: string; category: string; payment_terms: string; contact_name: string; contact_phone: string; contact_email: string }>(null);
  const [custBusy, setCustBusy] = useState(false);
  const [custErr, setCustErr] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("Deposit");
  const [mode, setMode] = useState<"pct" | "amount">("pct");
  const [pct, setPct] = useState("");
  const [amountEx, setAmountEx] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [po, setPo] = useState("");
  const [notes, setNotes] = useState("");
  const [descEdited, setDescEdited] = useState<string | null>(null);
  const [siteEdited, setSiteEdited] = useState<string | null>(null);
  const [deliveryAddr, setDeliveryAddr] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const q = quotes.find((x) => x.id === projectId) || null;
  const remainingEx = q ? round2(q.quote_ex - q.invoiced_ex) : 0;
  async function createCustomer() {
    if (!newCust || !newCust.name.trim()) return setCustErr("Enter the customer's name.");
    setCustBusy(true);
    setCustErr("");
    const row = {
      name: newCust.name.trim(),
      category: newCust.category,
      payment_terms: newCust.payment_terms,
      contact_name: newCust.contact_name.trim() || null,
      contact_phone: newCust.contact_phone.trim() || null,
      contact_email: newCust.contact_email.trim() || null,
    };
    const { data, error } = await supabase.from("customers").insert(row).select("id, name, payment_terms").single();
    setCustBusy(false);
    if (error || !data) return setCustErr(error?.message || "Could not create the customer");
    logAudit(supabase, { eventType: "create", entityType: "customer", entityId: data.id, entityLabel: data.name });
    setCustomers((prev) => [...prev, data as any].sort((a, b) => a.name.localeCompare(b.name)));
    setCustomerId(data.id);
    setDueTouched(false);
    setNewCust(null);
  }

  const customer = customers.find((c) => c.id === customerId) || null;
  const terms = q?.terms ?? customer?.payment_terms ?? null;
  const isItems = kind === "Items";

  const ex = useMemo(() => {
    if (kind === "Items") return 0;
    if (!q) return 0;
    if (kind === "Balance") return Math.max(0, remainingEx);
    if (kind === "Full") return q.quote_ex;
    if (mode === "pct") return round2((q.quote_ex * (Number(pct) || 0)) / 100);
    return round2(Number(amountEx) || 0);
  }, [q, kind, mode, pct, amountEx, remainingEx]);
  const gst = round2(ex * 0.1);
  const total = round2(ex + gst);

  const autoDesc = isItems
    ? `Sale of materials${q ? ` - Quote Q${q.quote_number}` : ""}${siteAddress(q) || siteEdited ? `, ${siteEdited ?? siteAddress(q)}` : ""}`
    : q
    ? `${kind === "Deposit" ? "Deposit" : kind === "Balance" ? "Balance on completion" : kind === "Full" ? "Insulation supply and installation" : "Progress payment"} - Quote Q${q.quote_number}${siteAddress(q) ? `, ${siteAddress(q)}` : ""}`
    : "";
  const description = descEdited ?? autoDesc;
  const siteAddr = siteEdited ?? (q ? siteAddress(q) : "");
  const autoDue = dueFromTerms(kind, terms, invoiceDate);
  const due = dueTouched ? dueDate : autoDue;

  async function create() {
    if (!q && !(isItems && customerId)) return setErr("Choose an accepted quote, or for an item sale choose a customer.");
    if (!isItems && ex <= 0) return setErr("Enter an amount above $0.");
    if (q && kind !== "Balance" && kind !== "Full" && ex > remainingEx + 0.005 && !confirm(`This is more than the ${money(remainingEx)} (ex GST) still to invoice on this quote. Create it anyway?`)) return;
    setSaving(true);
    setErr("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        project_id: q?.id ?? null,
        customer_id: q?.customer_id ?? customerId,
        kind,
        description,
        amount_ex_gst: ex,
        gst,
        total,
        invoice_date: invoiceDate,
        due_date: due || null,
        terms,
        customer_po: po.trim() || null,
        site_address: siteAddr.trim() || null,
        ...(deliveryAddr.trim() ? { delivery_address: deliveryAddr.trim() } : {}),
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    setSaving(false);
    if (error || !data) return setErr((error?.message || "Could not create the invoice") + " (has migration 0031 been run?)");
    logAudit(supabase, { eventType: "create", entityType: "invoice", entityId: data.id, entityLabel: `INV-${data.invoice_number}`, details: `${kind} ${isItems ? "item sale" : money(total)}${q ? ` for Q${q.quote_number}` : ""}` });
    router.push(`/dashboard/invoices/${data.id}`);
  }

  return (
    <div className="max-w-2xl">
      <Link href="/dashboard/invoices" className="text-sm text-[var(--muted)] hover:underline">← Invoices</Link>
      <h1 className="mt-2 text-2xl font-bold">New invoice</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Raised from an accepted quote. It&apos;s saved as a draft so you can check it before sending.</p>

      {problems.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {problems.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      )}
      {problems.length === 0 && quotes.length === 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          No accepted quotes found. A quote appears here once its outcome is set to <b>Accepted</b> (and it isn&apos;t archived). For a counter or item sale, set the type to <b>Items</b>.
        </div>
      )}

      <div className="mt-5 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <label className="block text-sm">
          Accepted quote {isItems && <span className="text-xs text-[var(--muted)]">(optional for item sales)</span>}
          <select className={input} value={projectId} onChange={(e) => { setProjectId(e.target.value); setDueTouched(false); setDescEdited(null); setSiteEdited(null); }}>
            <option value="">{isItems ? "No quote (counter / item sale)" : "Choose..."}</option>
            {quotes.map((x) => (
              <option key={x.id} value={x.id}>
                Q{x.quote_number} · {x.customer_name || "No customer"} · {siteAddress(x) || "no address"}
              </option>
            ))}
          </select>
        </label>

        {!q && isItems && (
          <label className="block text-sm">
            Customer
            <select className={input} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setDueTouched(false); }}>
              <option value="">Choose...</option>
              {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            {!newCust && (
              <button type="button" onClick={() => setNewCust({ name: "", category: "Private", payment_terms: "7 Days", contact_name: "", contact_phone: "", contact_email: "" })} className="mt-1 text-xs font-medium text-accent hover:underline">
                + New customer
              </button>
            )}
          </label>
        )}

        {!q && isItems && newCust && (
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[#f7f6f3] p-3 text-sm">
            <div className="font-semibold">New customer</div>
            <label className="block">
              Name
              <input className={input} value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                Type
                <select className={input} value={newCust.category} onChange={(e) => setNewCust({ ...newCust, category: e.target.value })}>
                  <option>Private</option>
                  <option>Builder</option>
                  <option>Retro Fit</option>
                </select>
              </label>
              <label className="block">
                Payment terms
                <select className={input} value={newCust.payment_terms} onChange={(e) => setNewCust({ ...newCust, payment_terms: e.target.value })}>
                  <option>7 Days</option>
                  <option>COD</option>
                  <option>30 Days</option>
                </select>
              </label>
              <label className="block">
                Contact name
                <input className={input} value={newCust.contact_name} onChange={(e) => setNewCust({ ...newCust, contact_name: e.target.value })} />
              </label>
              <label className="block">
                Phone
                <input className={input} value={newCust.contact_phone} onChange={(e) => setNewCust({ ...newCust, contact_phone: e.target.value })} />
              </label>
            </div>
            <label className="block">
              Email (used when emailing the invoice)
              <input className={input} type="email" value={newCust.contact_email} onChange={(e) => setNewCust({ ...newCust, contact_email: e.target.value })} />
            </label>
            {custErr && <p className="text-red-700">{custErr}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={createCustomer} disabled={custBusy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
                {custBusy ? "Saving..." : "Save customer"}
              </button>
              <button type="button" onClick={() => { setNewCust(null); setCustErr(""); }} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {q && !isItems && (
          <div className="grid gap-2 rounded-lg bg-[#f7f6f3] p-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-[var(--muted)]">Quote (ex GST)</p><p className="font-semibold">{money(q.quote_ex)}</p></div>
            <div><p className="text-xs text-[var(--muted)]">Already invoiced (ex GST)</p><p className="font-semibold">{money(q.invoiced_ex)}</p></div>
            <div><p className="text-xs text-[var(--muted)]">Still to invoice (ex GST)</p><p className="font-semibold">{money(remainingEx)}</p></div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Invoice type
            <select className={input} value={kind} onChange={(e) => { setKind(e.target.value as any); setDueTouched(false); setDescEdited(null); }}>
              {KINDS.map((k) => (<option key={k}>{k}</option>))}
            </select>
          </label>
          {(kind === "Deposit" || kind === "Progress" || kind === "Other") && !isItems && (
            <div className="block text-sm">
              Amount
              <div className="mt-1 flex gap-2">
                <select className="rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                  <option value="pct">% of quote</option>
                  <option value="amount">$ ex GST</option>
                </select>
                {mode === "pct" ? (
                  <input className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" inputMode="decimal" placeholder="e.g. 30" value={pct} onChange={(e) => setPct(e.target.value)} />
                ) : (
                  <input className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm" inputMode="decimal" placeholder="e.g. 1500" value={amountEx} onChange={(e) => setAmountEx(e.target.value)} />
                )}
              </div>
            </div>
          )}
        </div>

        <label className="block text-sm">
          Site address <span className="text-xs text-[var(--muted)]">(printed on the invoice; filled from the quote, change it if needed)</span>
          <input className={input} value={siteAddr} onChange={(e) => setSiteEdited(e.target.value)} placeholder="Lot, street, suburb" />
        </label>
        <label className="block text-sm">
          Delivery address <span className="text-xs text-[var(--muted)]">(optional - for product sales delivered somewhere other than the site; printed as &quot;Deliver to&quot;)</span>
          <textarea className={input} rows={2} value={deliveryAddr} onChange={(e) => setDeliveryAddr(e.target.value)} placeholder="Street, suburb, state, postcode" />
        </label>

        <label className="block text-sm">
          Description on invoice
          <input className={input} value={description} onChange={(e) => setDescEdited(e.target.value)} />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            Invoice date
            <input type="date" className={input} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </label>
          <label className="block text-sm">
            Due date {terms && <span className="text-xs text-[var(--muted)]">({kind === "Deposit" ? "deposit: on issue" : terms})</span>}
            <input type="date" className={input} value={due} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
          </label>
          <label className="block text-sm">
            Customer PO no.
            <input className={input} value={po} onChange={(e) => setPo(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm">
          Notes (printed on the invoice)
          <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {isItems ? (
          <p className="rounded-lg bg-[#f7f6f3] p-3 text-sm text-[var(--muted)]">You&apos;ll pick the inventory items, quantities and price point on the next screen.</p>
        ) : (
        <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
          <div className="flex justify-between"><span>Subtotal (ex GST)</span><span>{money(ex)}</span></div>
          <div className="flex justify-between"><span>GST (10%)</span><span>{money(gst)}</span></div>
          <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 font-bold"><span>Total</span><span>{money(total)}</span></div>
        </div>
        )}

        {err && <p className="text-sm text-red-700">{err}</p>}
        <button onClick={create} disabled={saving} className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Creating..." : isItems ? "Create and add items" : "Create draft invoice"}
        </button>
      </div>
    </div>
  );
}
