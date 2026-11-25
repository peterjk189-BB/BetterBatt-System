"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { cnNo, creditRemaining, fmtDate, invNo, money, paidTotal, PAY_METHODS, round2, today, type Invoice, type Payment } from "@/lib/invoices";

// On a credit note: record the refund paid back to the customer, or apply the credit to another of their invoices.
// Both are stored as negative payments on the credit note (applying also records a payment on the other invoice).
export default function CreditSettle({
  inv,
  payments,
  setPayments,
  onMsg,
}: {
  inv: Invoice;
  payments: Payment[];
  setPayments: (p: Payment[]) => void;
  onMsg: (m: { ok: boolean; text: string }) => void;
}) {
  const supabase = createClient();
  const paid = paidTotal(payments);
  const remaining = creditRemaining(inv.total, paid);
  const [mode, setMode] = useState<"refund" | "apply">("refund");
  const [refund, setRefund] = useState({ date: today(), amount: "", method: "Bank transfer", ref: "" });
  const [targets, setTargets] = useState<{ id: string; invoice_number: number; balance: number; invoice_date: string }[] | null>(null);
  const [target, setTarget] = useState("");
  const [applyAmt, setApplyAmt] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadTargets() {
    if (targets || !inv.customer_id) return setTargets(targets ?? []);
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_number, total, kind, status, invoice_date")
      .eq("customer_id", inv.customer_id)
      .neq("status", "Void")
      .neq("status", "Draft")
      .gt("total", 0);
    const ids = ((invs ?? []) as any[]).map((i) => i.id);
    const { data: pays } = ids.length ? await supabase.from("invoice_payments").select("invoice_id, amount").in("invoice_id", ids) : { data: [] as any[] };
    const paidBy = new Map<string, number>();
    for (const p of (pays ?? []) as any[]) paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
    const open = ((invs ?? []) as any[])
      .map((i) => ({ id: i.id, invoice_number: i.invoice_number, invoice_date: i.invoice_date, balance: round2(Number(i.total) - (paidBy.get(i.id) ?? 0)) }))
      .filter((i) => i.balance > 0.005)
      .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
    setTargets(open);
    if (open.length === 1) {
      setTarget(open[0].id);
      setApplyAmt(String(Math.min(remaining, open[0].balance).toFixed(2)));
    }
  }

  async function recordRefund() {
    const amount = round2(Number(refund.amount) || 0);
    if (amount <= 0) return onMsg({ ok: false, text: "Enter the amount refunded." });
    if (amount > remaining + 0.005 && !confirm(`That's more than the ${money(remaining)} credit left. Record it anyway?`)) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("invoice_payments")
      .insert({ invoice_id: inv.id, paid_on: refund.date, amount: -amount, method: `Refund – ${refund.method}`, reference: refund.ref.trim() || null, created_by: user?.id ?? null })
      .select()
      .single();
    setBusy(false);
    if (error || !data) return onMsg({ ok: false, text: error?.message || "Could not record the refund" });
    setPayments([...payments, data as Payment]);
    setRefund({ ...refund, amount: "", ref: "" });
    onMsg({ ok: true, text: `Refund of ${money(amount)} recorded.` });
    logAudit(supabase, { eventType: "create", entityType: "invoice_payment", entityId: inv.id, entityLabel: cnNo(inv.invoice_number), details: `Refund ${money(amount)} ${refund.method}` });
  }

  async function applyCredit() {
    const t = targets?.find((x) => x.id === target);
    const amount = round2(Number(applyAmt) || 0);
    if (!t) return onMsg({ ok: false, text: "Choose the invoice to apply the credit to." });
    if (amount <= 0) return onMsg({ ok: false, text: "Enter the amount to apply." });
    if (amount > remaining + 0.005) return onMsg({ ok: false, text: `Only ${money(remaining)} of credit is left.` });
    if (amount > t.balance + 0.005) return onMsg({ ok: false, text: `${invNo(t.invoice_number)} only has ${money(t.balance)} owing.` });
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const day = today();
    const { data: onTarget, error: e1 } = await supabase
      .from("invoice_payments")
      .insert({ invoice_id: t.id, paid_on: day, amount, method: "Credit note", reference: cnNo(inv.invoice_number), created_by: user?.id ?? null })
      .select()
      .single();
    if (e1 || !onTarget) {
      setBusy(false);
      return onMsg({ ok: false, text: e1?.message || "Could not apply the credit" });
    }
    const { data: onCredit, error: e2 } = await supabase
      .from("invoice_payments")
      .insert({ invoice_id: inv.id, paid_on: day, amount: -amount, method: "Applied to invoice", reference: invNo(t.invoice_number), created_by: user?.id ?? null })
      .select()
      .single();
    setBusy(false);
    if (e2 || !onCredit) {
      await supabase.from("invoice_payments").delete().eq("id", (onTarget as any).id);
      return onMsg({ ok: false, text: e2?.message || "Could not apply the credit" });
    }
    setPayments([...payments, onCredit as Payment]);
    setTargets((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, balance: round2(x.balance - amount) } : x)).filter((x) => x.balance > 0.005));
    setApplyAmt("");
    onMsg({ ok: true, text: `${money(amount)} applied to ${invNo(t.invoice_number)}.` });
    logAudit(supabase, { eventType: "create", entityType: "invoice_payment", entityId: inv.id, entityLabel: cnNo(inv.invoice_number), details: `Credit ${money(amount)} applied to ${invNo(t.invoice_number)}` });
  }

  async function remove(p: Payment) {
    const applied = p.method === "Applied to invoice";
    if (!confirm(applied ? `Remove this ${money(Math.abs(p.amount))}? Also remove the matching "Credit note ${cnNo(inv.invoice_number)}" payment on ${p.reference}.` : `Remove the ${money(Math.abs(p.amount))} refund?`)) return;
    const { error } = await supabase.from("invoice_payments").delete().eq("id", p.id);
    if (error) return onMsg({ ok: false, text: error.message });
    setPayments(payments.filter((x) => x.id !== p.id));
  }

  const field = "rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Refund or apply credit</h2>
        <p className="text-sm">
          Credit {money(-inv.total)} · Used {money(-paid)} · <b className={remaining > 0.005 ? "text-[#b91c1c]" : "text-green-700"}>{remaining > 0.005 ? `${money(remaining)} still to refund or apply` : "Fully settled"}</b>
        </p>
      </div>
      {payments.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border)] text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
              <span>{fmtDate(p.paid_on)} · {p.method || "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
              <span className="flex items-center gap-3">
                <b>{money(Math.abs(p.amount))}</b>
                <button onClick={() => remove(p)} className="text-xs text-red-700 underline">Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {inv.status === "Draft" ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Mark the credit note as sent (or email it) before recording a refund or applying the credit.</p>
      ) : remaining > 0.005 ? (
        <>
          <div className="mt-3 flex gap-2">
            {([["refund", "Refund to customer"], ["apply", "Apply to another invoice"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => { setMode(k); if (k === "apply") loadTargets(); }}
                className={`rounded-full px-3 py-1 text-sm ${mode === k ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"}`}
              >
                {l}
              </button>
            ))}
          </div>
          {mode === "refund" ? (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                <input type="date" aria-label="Refund date" className={field} value={refund.date} onChange={(e) => setRefund({ ...refund, date: e.target.value })} />
                <input aria-label="Amount refunded" className={field} inputMode="decimal" placeholder={`Amount (${remaining.toFixed(2)})`} value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
                <select aria-label="Refund method" className={field} value={refund.method} onChange={(e) => setRefund({ ...refund, method: e.target.value })}>
                  {PAY_METHODS.map((m) => (<option key={m}>{m}</option>))}
                </select>
                <input aria-label="Reference" className={field} placeholder="Reference" value={refund.ref} onChange={(e) => setRefund({ ...refund, ref: e.target.value })} />
                <button onClick={recordRefund} disabled={busy} className="rounded-lg bg-[#201f1c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Record refund</button>
              </div>
              <button onClick={() => setRefund({ ...refund, amount: remaining.toFixed(2) })} className="mt-2 text-xs text-accent underline">Fill the full credit</button>
            </>
          ) : targets === null ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Loading invoices…</p>
          ) : targets.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">This customer has no other invoices with money owing.</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <select
                aria-label="Invoice to apply the credit to"
                className={field}
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  const t = targets.find((x) => x.id === e.target.value);
                  if (t) setApplyAmt(Math.min(remaining, t.balance).toFixed(2));
                }}
              >
                <option value="">Choose an invoice…</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{invNo(t.invoice_number)} · {fmtDate(t.invoice_date)} · {money(t.balance)} owing</option>
                ))}
              </select>
              <input aria-label="Amount to apply" className={field} inputMode="decimal" placeholder="Amount" value={applyAmt} onChange={(e) => setApplyAmt(e.target.value)} />
              <button onClick={applyCredit} disabled={busy || !target} className="rounded-lg bg-[#201f1c] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Apply credit</button>
              {target && (
                <Link href={`/dashboard/invoices/${target}`} className="text-xs text-accent underline sm:col-span-3">Open {invNo(targets.find((x) => x.id === target)?.invoice_number ?? 0)}</Link>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
