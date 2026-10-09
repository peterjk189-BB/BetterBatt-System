"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Subcontractor } from "./SubcontractorPanel";

const inputCls = "rounded-lg border border-[var(--border)] px-3 py-2";

/** Payment details + onboarding facts. Bank numbers stay hidden until "Show" is pressed. */
export default function SubBanking({
  subcontractor,
  onSubcontractorChange,
}: {
  subcontractor: Subcontractor;
  onSubcontractorChange?: (s: Subcontractor) => void;
}) {
  const supabase = createClient();
  const [shown, setShown] = useState(false);
  const [f, setF] = useState({
    trading_name: subcontractor.trading_name ?? "",
    whitecard_number: subcontractor.whitecard_number ?? "",
    bank_account_name: subcontractor.bank_account_name ?? "",
    bank_bsb: subcontractor.bank_bsb ?? "",
    bank_account_number: subcontractor.bank_account_number ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasBank = !!(f.bank_bsb || f.bank_account_number);

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = {
      trading_name: f.trading_name.trim() || null,
      whitecard_number: f.whitecard_number.trim() || null,
      bank_account_name: f.bank_account_name.trim() || null,
      bank_bsb: f.bank_bsb.trim() || null,
      bank_account_number: f.bank_account_number.trim() || null,
    };
    const { error } = await supabase.from("subcontractors").update(payload).eq("id", subcontractor.id);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: /schema cache|column/i.test(error.message) ? "Run migration 0030 in Supabase first." : error.message });
    onSubcontractorChange?.({ ...subcontractor, ...payload });
    logAudit(supabase, { eventType: "update", entityType: "subcontractor", entityId: subcontractor.id, entityLabel: subcontractor.name, details: "Updated payment / onboarding details" });
    setMsg({ ok: true, text: "Saved." });
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Payment &amp; onboarding details</h3>
        <button onClick={() => setShown((v) => !v)} className="text-xs text-accent underline">
          {shown ? "Hide bank details" : "Show bank details"}
        </button>
      </div>
      {subcontractor.agreement_signed_at && (
        <p className="mt-1 text-xs text-green-700">
          Working agreement signed {new Date(subcontractor.agreement_signed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          {" "}(PDF under Signed Agreement below).
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Trading name
          <input className={inputCls} value={f.trading_name} onChange={(e) => setF({ ...f, trading_name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          White Card number
          <input className={inputCls} value={f.whitecard_number} onChange={(e) => setF({ ...f, whitecard_number: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Bank account name
          <input className={inputCls} name="sub-bank-acct-name" autoComplete="off" data-1p-ignore value={f.bank_account_name} onChange={(e) => setF({ ...f, bank_account_name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          BSB
          <input
            className={inputCls}
            type="text"
            name="sub-bank-bsb"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            style={shown ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
            value={f.bank_bsb}
            onChange={(e) => setF({ ...f, bank_bsb: e.target.value })}
            placeholder={hasBank ? "" : "123-456"}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Account number
          <input
            className={inputCls}
            type="text"
            name="sub-bank-acct"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            style={shown ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
            value={f.bank_account_number}
            onChange={(e) => setF({ ...f, bank_account_number: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? "Saving..." : "Save"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
