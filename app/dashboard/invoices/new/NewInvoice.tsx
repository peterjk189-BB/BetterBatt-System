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

export default function NewInvoice({ quotes, customers, initialProjectId }: { quotes: QuoteItem[]; customers: { id: string; name: string; payment_terms: string | null }[]; initialProjectId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [customerId, setCustomerId] = useState("");
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const q = quotes.find((x) => x.id === projectId) || null;
  const remainingEx = q ? round2(q.quote_ex - q.invoiced_ex) : 0;
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
          </label>
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
