"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { cnNo, invNo, money, round2, round4, today, type Invoice, type InvoiceLine } from "@/lib/invoices";

// "Create credit note" on an invoice: pick what came back (or an amount), add an optional restocking fee,
// and a draft credit note (negative amounts) is created against this invoice.
export default function CreditNoteButton({
  inv,
  lines,
  credited,
}: {
  inv: Invoice & { bill_to_name?: string | null };
  lines: InvoiceLine[];
  /** Credit notes already raised against this invoice: total credited inc GST (positive). */
  credited: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [otherDesc, setOtherDesc] = useState("");
  const [otherAmt, setOtherAmt] = useState("");
  const [fee, setFee] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lines are credited at the price actually charged: any discount on the invoice is spread across them.
  const discountEx = Number(inv.discount_ex_gst || 0);
  const subtotal = round2(Number(inv.amount_ex_gst || 0) + discountEx);
  const factor = subtotal > 0 ? Number(inv.amount_ex_gst || 0) / subtotal : 1;
  const sold = lines.filter((l) => Number(l.qty) > 0);
  const unitOf = (l: InvoiceLine) => round4(Number(l.unit_price || 0) * factor);

  const itemEx = round2(sold.reduce((s, l) => s + round2(Math.min(Number(qty[l.id]) || 0, Number(l.qty)) * unitOf(l)), 0));
  const otherEx = round2(Math.max(0, Number(otherAmt) || 0));
  const feeEx = round2(Math.max(0, Number(fee) || 0));
  const creditEx = round2(itemEx + otherEx - feeEx);
  const creditGst = round2(creditEx * 0.1);
  const creditTotal = round2(creditEx + creditGst);
  const overCredit = creditTotal + credited > Number(inv.total) + 0.005;

  function openIt() {
    setQty({});
    setOtherDesc(sold.length ? "" : inv.description || `${inv.kind} invoice`);
    setOtherAmt("");
    setFee("");
    setReason("");
    setErr(null);
    setOpen(true);
  }

  async function create() {
    setErr(null);
    if (creditEx <= 0) return setErr("Enter the quantities returned or an amount to credit.");
    if (otherEx > 0 && !otherDesc.trim()) return setErr("Describe the amount being credited.");
    if (overCredit && !confirm(`This credits more than the invoice total (${money(inv.total)}${credited > 0 ? `, ${money(credited)} already credited` : ""}). Create it anyway?`)) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: cn, error } = await supabase
      .from("invoices")
      .insert({
        kind: "Credit",
        credit_of: inv.id,
        customer_id: inv.customer_id,
        project_id: inv.project_id,
        description: `Credit for ${invNo(inv.invoice_number)}${reason.trim() ? ` – ${reason.trim()}` : ""}`,
        amount_ex_gst: -creditEx,
        gst: -creditGst,
        total: -creditTotal,
        invoice_date: today(),
        due_date: today(),
        terms: inv.terms,
        customer_po: inv.customer_po,
        site_address: inv.site_address ?? null,
        notes: reason.trim() || null,
        status: "Draft",
        created_by: user?.id ?? null,
        ...(inv.bill_to_name ? { bill_to_name: inv.bill_to_name } : {}),
      } as any)
      .select("id, invoice_number")
      .single();
    if (error || !cn) {
      setBusy(false);
      return setErr(/credit_of|invoices_kind_check|Credit/.test(error?.message || "") ? "Credit notes need migration 0105 run in Supabase first (SQL Editor)." : error?.message || "Could not create the credit note");
    }
    const hasFulfil = lines.some((l) => l.fulfilment !== undefined);
    const rows: any[] = [];
    for (const l of sold) {
      const q = Math.min(Number(qty[l.id]) || 0, Number(l.qty));
      if (q <= 0) continue;
      const unit = unitOf(l);
      // Negative quantity = a return: on the credit note's pick list the packs go back into stock.
      rows.push({ invoice_id: cn.id, part_id: l.part_id, description: l.description, qty: -q, unit_price: unit, line_ex: round2(-q * unit), sort_order: rows.length, ...(hasFulfil ? { fulfilment: "warehouse" } : {}) });
    }
    if (otherEx > 0) rows.push({ invoice_id: cn.id, part_id: null, description: otherDesc.trim(), qty: -1, unit_price: otherEx, line_ex: -otherEx, sort_order: rows.length });
    if (feeEx > 0) rows.push({ invoice_id: cn.id, part_id: null, description: "Restocking fee", qty: 1, unit_price: feeEx, line_ex: feeEx, sort_order: rows.length });
    const { error: lineErr } = await supabase.from("invoice_lines").insert(rows);
    if (lineErr) {
      await supabase.from("invoices").delete().eq("id", cn.id);
      setBusy(false);
      return setErr(lineErr.message);
    }
    logAudit(supabase, {
      eventType: "create",
      entityType: "invoice",
      entityId: cn.id,
      entityLabel: cnNo(cn.invoice_number),
      details: `Credit note for ${invNo(inv.invoice_number)}: ${money(creditTotal)} inc GST${reason.trim() ? ` (${reason.trim()})` : ""}`,
    });
    router.push(`/dashboard/invoices/${cn.id}`);
  }

  const field = "rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm";
  return (
    <>
      <button onClick={openIt} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">
        Create credit note
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Credit note for {invNo(inv.invoice_number)}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Enter what the customer returned, or an amount to credit. It&apos;s created as a draft you can check before sending.
              {credited > 0 && <span className="font-medium text-amber-700"> {money(credited)} has already been credited on this invoice.</span>}
            </p>

            {sold.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-black/[0.03] text-left text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-right">Sold</th>
                      <th className="px-3 py-2 text-right">Price (ex GST)</th>
                      <th className="px-3 py-2 text-right">Returned</th>
                      <th className="px-3 py-2 text-right">Credit (ex GST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sold.map((l) => {
                      const q = Math.min(Number(qty[l.id]) || 0, Number(l.qty));
                      return (
                        <tr key={l.id} className="border-t border-[var(--border)]">
                          <td className="px-3 py-2">{l.description}</td>
                          <td className="px-3 py-2 text-right">{Number(l.qty)}</td>
                          <td className="px-3 py-2 text-right">{money(unitOf(l))}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              className={`${field} w-20 text-right`}
                              inputMode="decimal"
                              aria-label={`Quantity returned of ${l.description}`}
                              placeholder="0"
                              value={qty[l.id] ?? ""}
                              onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                            />
                            <button type="button" onClick={() => setQty({ ...qty, [l.id]: String(Number(l.qty)) })} className="ml-1 text-xs text-accent hover:underline">All</button>
                          </td>
                          <td className="px-3 py-2 text-right">{q > 0 ? money(round2(q * unitOf(l))) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {Math.abs(factor - 1) > 0.0001 && <p className="px-3 py-2 text-xs text-[var(--muted)]">Prices include the discount given on the invoice.</p>}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem]">
              <label className="text-sm font-medium">
                {sold.length ? "Other amount to credit (optional)" : "What's being credited"}
                <input className={`${field} mt-1 w-full`} placeholder="e.g. Overcharge on delivery" value={otherDesc} onChange={(e) => setOtherDesc(e.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Amount (ex GST)
                <input className={`${field} mt-1 w-full text-right`} inputMode="decimal" placeholder="0.00" value={otherAmt} onChange={(e) => setOtherAmt(e.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Reason (shown on the credit note)
                <input className={`${field} mt-1 w-full`} placeholder="e.g. Unused stock returned" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Restocking fee (ex GST)
                <input className={`${field} mt-1 w-full text-right`} inputMode="decimal" placeholder="0.00" value={fee} onChange={(e) => setFee(e.target.value)} />
              </label>
            </div>

            <div className="mt-4 rounded-lg bg-black/[0.03] p-3 text-sm">
              <div className="flex justify-between"><span>Credit (ex GST)</span><span>{money(Math.max(0, creditEx))}</span></div>
              <div className="flex justify-between"><span>GST</span><span>{money(Math.max(0, creditGst))}</span></div>
              <div className="mt-1 flex justify-between text-base font-bold"><span>Total credit (inc GST)</span><span>{money(Math.max(0, creditTotal))}</span></div>
              {overCredit && <p className="mt-1 text-xs font-semibold text-amber-700">More than the invoice total of {money(inv.total)}.</p>}
            </div>

            {err && <p className="mt-3 rounded-lg bg-[#fde8e8] p-3 text-sm text-[#b91c1c]">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium">Cancel</button>
              <button type="button" onClick={create} disabled={busy || creditEx <= 0} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {busy ? "Creating…" : "Create credit note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
