"use client";

import { useMemo, useState, type ReactNode } from "react";
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
const field = "mt-1 h-11 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm";

// Display order and one-line help for the invoice type cards
const KIND_INFO: { kind: (typeof KINDS)[number]; sub: string }[] = [
  { kind: "Deposit", sub: "Upfront % of quote" },
  { kind: "Progress", sub: "Part payment" },
  { kind: "Balance", sub: "Whatever is left" },
  { kind: "Full", sub: "Whole quote at once" },
  { kind: "Items", sub: "Counter / product sale" },
  { kind: "Other", sub: "Custom amount" },
];

// Quick-pick percentages for each type that takes a % of the quote
const QUICK_PCTS: Record<string, number[]> = {
  Deposit: [50, 75],
  Progress: [10, 20, 30, 50, 100],
  Other: [10, 20, 30, 50, 100],
};

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">{n}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

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
  const [pct, setPct] = useState("50");
  const [showDelivery, setShowDelivery] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
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

  function chooseKind(k: (typeof KINDS)[number]) {
    setKind(k);
    setDueTouched(false);
    setDescEdited(null);
    setMode("pct");
    setPct(QUICK_PCTS[k] ? String(QUICK_PCTS[k][0]) : "");
  }

  const showAmount = !isItems && (kind === "Deposit" || kind === "Progress" || kind === "Other");
  const quickPcts = QUICK_PCTS[kind] ?? [];
  const pctInvoiced = q && q.quote_ex > 0 ? Math.min(100, (q.invoiced_ex / q.quote_ex) * 100) : 0;
  const pctThis = q && q.quote_ex > 0 ? Math.min(100 - pctInvoiced, (ex / q.quote_ex) * 100) : 0;
  const leftAfter = q ? Math.max(0, round2(remainingEx - ex)) : 0;
  const billTo = q ? q.customer_name || "No customer" : customer?.name || "";
  let stepNo = 2;
  const amountStep = showAmount ? ++stepNo : 0;
  const detailsStep = ++stepNo;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/invoices" className="text-sm text-[var(--muted)] hover:underline">← Invoices</Link>
          <h1 className="mt-1 text-2xl font-bold">New invoice</h1>
        </div>
        <p className="text-sm text-[var(--muted)]">Saved as a draft. Nothing is sent until you review it.</p>
      </div>

      {problems.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {problems.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      )}
      {problems.length === 0 && quotes.length === 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          No accepted quotes found. A quote appears here once its outcome is set to <b>Accepted</b> (and it isn&apos;t archived). For a counter or item sale, choose <b>Items</b>.
        </div>
      )}

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <Step n={1} title="What are you invoicing?">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {KIND_INFO.map(({ kind: k, sub }) => {
                const on = k === kind;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => chooseKind(k)}
                    aria-pressed={on}
                    className={`flex min-h-16 flex-col items-start rounded-lg px-3.5 py-3 text-left transition ${on ? "border-2 border-accent bg-blue-50" : "border border-[var(--border)] bg-white hover:border-gray-400"}`}
                  >
                    <span className="text-sm font-semibold">{k}</span>
                    <span className="text-xs text-[var(--muted)]">{sub}</span>
                  </button>
                );
              })}
            </div>
          </Step>

          <Step n={2} title={isItems ? "Quote or customer" : "Which quote?"}>
            <label className="block text-sm">
              Accepted quote {isItems && <span className="text-xs text-[var(--muted)]">(optional for item sales)</span>}
              <select className={field} value={projectId} onChange={(e) => { setProjectId(e.target.value); setDueTouched(false); setDescEdited(null); setSiteEdited(null); }}>
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
                <select className={field} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setDueTouched(false); }}>
                  <option value="">Choose...</option>
                  {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
                {!newCust && (
                  <button type="button" onClick={() => setNewCust({ name: "", category: "Private", payment_terms: "7 Days", contact_name: "", contact_phone: "", contact_email: "" })} className="mt-1.5 text-sm font-medium text-accent hover:underline">
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
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[#fafbfc] p-3.5">
                <div>
                  <p className="text-sm font-semibold">Q{q.quote_number} · {q.customer_name || "No customer"}</p>
                  <p className="text-xs text-[var(--muted)]">{siteAddress(q) || "No address"}{terms ? ` · Terms ${terms}` : ""}</p>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                  <div className="bg-accent" style={{ width: `${pctInvoiced}%` }} />
                  <div className="bg-blue-300" style={{ width: `${pctThis}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-[var(--muted)]">
                  <div>Quote (ex GST)<p className="text-sm font-semibold text-gray-900">{money(q.quote_ex)}</p></div>
                  <div>Invoiced<p className="text-sm font-semibold text-gray-900">{money(q.invoiced_ex)}</p></div>
                  <div>Still to invoice<p className="text-sm font-semibold text-accent">{money(remainingEx)}</p></div>
                </div>
              </div>
            )}
          </Step>

          {showAmount && (
            <Step n={amountStep} title="How much?">
              <div className="flex flex-wrap gap-2">
                {quickPcts.map((p) => {
                  const on = mode === "pct" && Number(pct) === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setMode("pct"); setPct(String(p)); }}
                      aria-pressed={on}
                      className={`h-11 rounded-full px-5 text-sm transition ${on ? "border border-gray-900 bg-gray-900 text-white" : "border border-[var(--border)] bg-white hover:border-gray-400"}`}
                    >
                      {p}%
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block min-w-[180px] flex-1 text-sm">
                  Or enter $ amount (ex GST)
                  <input
                    className={field}
                    inputMode="decimal"
                    placeholder="e.g. 1500"
                    value={mode === "amount" ? amountEx : ""}
                    onChange={(e) => { setMode("amount"); setAmountEx(e.target.value); }}
                  />
                </label>
                <label className="block w-32 text-sm">
                  Or other %
                  <input
                    className={field}
                    inputMode="decimal"
                    placeholder="e.g. 40"
                    value={mode === "pct" && !quickPcts.includes(Number(pct)) ? pct : ""}
                    onChange={(e) => { setMode("pct"); setPct(e.target.value); }}
                  />
                </label>
                <p className="pb-3 text-sm text-[var(--muted)]">= <span className="font-medium text-gray-900">{money(ex)}</span> ex GST</p>
              </div>
            </Step>
          )}

          {(kind === "Balance" || kind === "Full" || isItems) && (
            <p className="rounded-xl border border-[var(--border)] bg-white px-5 py-4 text-sm text-[var(--muted)]">
              {isItems
                ? "You'll pick the inventory items, quantities and price point on the next screen."
                : kind === "Balance"
                ? "The amount is set automatically to what's still to invoice on the quote."
                : "The amount is the full quote value."}
            </p>
          )}

          <Step n={detailsStep} title="Invoice details">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                Invoice date
                <input type="date" className={field} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </label>
              <label className="block text-sm">
                Due date {terms && <span className="text-xs text-[var(--muted)]">({kind === "Deposit" ? "deposit: on issue" : terms})</span>}
                <input type="date" className={field} value={due} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
              </label>
              <label className="block text-sm">
                Customer PO no.
                <input className={field} value={po} onChange={(e) => setPo(e.target.value)} />
              </label>
            </div>
            <label className="block text-sm">
              Description on invoice
              <input className={field} value={description} onChange={(e) => setDescEdited(e.target.value)} />
            </label>
            <label className="block text-sm">
              Site address <span className="text-xs text-[var(--muted)]">(filled from the quote, change it if needed)</span>
              <input className={field} value={siteAddr} onChange={(e) => setSiteEdited(e.target.value)} placeholder="Lot, street, suburb" />
            </label>

            {(showDelivery || deliveryAddr) && (
              <label className="block text-sm">
                Delivery address <span className="text-xs text-[var(--muted)]">(printed as &quot;Deliver to&quot;)</span>
                <textarea className={input} rows={2} value={deliveryAddr} onChange={(e) => setDeliveryAddr(e.target.value)} placeholder="Street, suburb, state, postcode" />
              </label>
            )}
            {(showNotes || notes) && (
              <label className="block text-sm">
                Notes (printed on the invoice)
                <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            )}
            {(!(showDelivery || deliveryAddr) || !(showNotes || notes)) && (
              <div className="flex flex-wrap gap-4 text-sm">
                {!(showDelivery || deliveryAddr) && (
                  <button type="button" onClick={() => setShowDelivery(true)} className="font-medium text-accent hover:underline">+ Add delivery address</button>
                )}
                {!(showNotes || notes) && (
                  <button type="button" onClick={() => setShowNotes(true)} className="font-medium text-accent hover:underline">+ Add note for the invoice</button>
                )}
              </div>
            )}
          </Step>
        </div>

        <aside className="w-full space-y-4 rounded-xl border border-[var(--border)] bg-white p-5 lg:sticky lg:top-6 lg:w-[360px] lg:shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Summary</h2>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-800">DRAFT</span>
          </div>
          <div className="text-sm">
            <p className="text-[var(--muted)]">Bill to</p>
            <p className="font-semibold">{billTo || "Choose a quote or customer"}</p>
            {siteAddr && <p className="text-[var(--muted)]">Site: {siteAddr}</p>}
          </div>
          {description && <p className="border-t border-[var(--border)] pt-3 text-sm">{description}</p>}
          {isItems ? (
            <p className="rounded-lg bg-[#f7f6f3] p-3 text-sm text-[var(--muted)]">Totals are worked out from the items you add next.</p>
          ) : (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-[var(--muted)]">Subtotal (ex GST)</span><span>{money(ex)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">GST (10%)</span><span>{money(gst)}</span></div>
              <div className="mt-1 flex justify-between border-t-2 border-gray-900 pt-2 text-lg font-bold"><span>Total</span><span>{money(total)}</span></div>
              <div className="flex justify-between text-[var(--muted)]"><span>Due</span><span>{due || "-"}</span></div>
            </div>
          )}
          {q && !isItems && (
            <p className="rounded-lg bg-[#f4f5f7] px-3 py-2 text-xs text-[var(--muted)]">After this invoice, {money(leftAfter)} ex GST left to invoice on the quote.</p>
          )}
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button onClick={create} disabled={saving} className="h-12 w-full rounded-lg bg-accent text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Creating..." : isItems ? "Create and add items" : "Create draft invoice"}
          </button>
          <Link href="/dashboard/invoices" className="block text-center text-sm text-[var(--muted)] hover:underline">Cancel</Link>
        </aside>
      </div>
    </div>
  );
}
