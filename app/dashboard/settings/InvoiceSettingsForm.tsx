"use client";

import { useState } from "react";

type V = { bank: string; footer: string; ar: string; income: string; gst: string };

export default function InvoiceSettingsForm({ initial }: { initial: V }) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const set = (k: keyof V) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setV({ ...v, [k]: e.target.value });
    setStatus("idle");
  };

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_bank_details: v.bank,
          invoice_footer: v.footer,
          qb_ar_account: v.ar,
          qb_income_account: v.income,
          qb_gst_account: v.gst,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg((data.error || "Something went wrong") + (/column|schema/i.test(data.error || "") ? " (run migration 0031 in Supabase first)" : ""));
        return;
      }
      setStatus("saved");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";
  return (
    <div className="mt-6 max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-semibold">Invoicing &amp; QuickBooks</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">Printed on every invoice, plus the account names QuickBooks Desktop needs so the import file matches your chart of accounts.</p>
      <label className="mt-3 block text-sm">
        Bank details for payment (one line per row)
        <textarea className={inputCls} rows={3} placeholder={"Account name: Better Batt Insulation Pty Ltd\nBSB: 000-000   Account: 00000000"} value={v.bank} onChange={set("bank")} />
      </label>
      <label className="mt-3 block text-sm">
        Invoice footer (optional)
        <textarea className={inputCls} rows={2} placeholder="Late payments may incur interest. Thank you for your business." value={v.footer} onChange={set("footer")} />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">QuickBooks receivables account<input className={inputCls} placeholder="Accounts Receivable" value={v.ar} onChange={set("ar")} /></label>
        <label className="block text-sm">QuickBooks income account<input className={inputCls} placeholder="Sales" value={v.income} onChange={set("income")} /></label>
        <label className="block text-sm">QuickBooks GST account<input className={inputCls} placeholder="GST Collected" value={v.gst} onChange={set("gst")} /></label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
        {status === "saved" && <span className="text-sm text-green-700">Saved.</span>}
        {status === "error" && <span className="text-sm text-red-700">{errorMsg}</span>}
      </div>
    </div>
  );
}
