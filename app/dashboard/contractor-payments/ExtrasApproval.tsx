"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import PartPicker from "@/app/dashboard/PartPicker";

type Part = { id: string; name: string; installer_rate_per_m2: number | null };
export type PendingExtra = {
  id: string;
  work_order_id: string;
  subcontractor_id: string | null;
  description: string;
  qty: number;
  note: string | null;
  work_date: string | null;
  work_orders: { wo_number: string; projects: { address: string | null; suburb: string | null; customers: { name: string } | null } | null } | null;
  subcontractors: { name: string } | null;
};

const fmt = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

function Row({ x, parts }: { x: PendingExtra; parts: Part[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [partId, setPartId] = useState<string | null>(null);
  const [rate, setRate] = useState("");
  const [qty, setQty] = useState(String(x.qty));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const site = [x.work_orders?.projects?.address, x.work_orders?.projects?.suburb].filter(Boolean).join(", ");

  async function approve() {
    if (!partId) return setError("Pick the product this should be paid as (a non-inventory part works for call-outs etc.).");
    const q = Number(qty) || 0;
    const r = Number(rate) || 0;
    setBusy(true);
    setError(null);
    const { data: au } = await supabase.auth.getUser();
    const { error: insErr } = await supabase.from("work_order_lines").insert({
      work_order_id: x.work_order_id,
      part_id: partId,
      qty: q,
      rate: r,
      subcontractor_id: x.subcontractor_id,
      task_date: x.work_date,
      completed: true,
      note: `Contractor-added: ${x.description}${x.note ? ` — ${x.note}` : ""}`,
      sort_order: 999,
    });
    if (insErr) {
      setBusy(false);
      return setError(insErr.message);
    }
    await supabase
      .from("work_order_extras")
      .update({ status: "Approved", part_id: partId, rate: r, qty: q, decided_by: au.user?.id ?? null, decided_at: new Date().toISOString() })
      .eq("id", x.id);
    logAudit(supabase, {
      eventType: "update",
      entityType: "work_order",
      entityId: x.work_order_id,
      entityLabel: x.work_orders?.wo_number || "",
      details: `Approved contractor item "${x.description}" × ${q} at ${fmt(r)}`,
    });
    setBusy(false);
    router.refresh();
  }

  async function reject() {
    setBusy(true);
    const { data: au } = await supabase.auth.getUser();
    await supabase
      .from("work_order_extras")
      .update({ status: "Rejected", decided_by: au.user?.id ?? null, decided_at: new Date().toISOString(), decision_note: reason.trim() || null })
      .eq("id", x.id);
    setBusy(false);
    router.refresh();
  }

  const input = "rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm";
  return (
    <div className="rounded-lg bg-white p-3 text-sm text-[#201f1c]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold">{x.subcontractors?.name || "Contractor"}</span> added{" "}
          <span className="font-semibold">{x.description}</span> × {x.qty}
          {x.work_date ? ` on ${new Date(x.work_date + "T00:00:00").toLocaleDateString("en-AU")}` : ""}
        </div>
        <Link href={`/dashboard/work-orders/${x.work_order_id}`} className="text-[#2563eb] hover:underline">
          WO {x.work_orders?.wo_number}
        </Link>
      </div>
      <div className="text-xs text-[#6b6862]">
        {[x.work_orders?.projects?.customers?.name, site].filter(Boolean).join(" · ")}
        {x.note ? ` · "${x.note}"` : ""}
      </div>
      <div className="mt-2 grid grid-cols-2 items-center gap-2 sm:grid-cols-12">
        <div className="col-span-2 sm:col-span-5">
          <PartPicker
            parts={parts}
            value={partId}
            onChange={(id) => {
              setPartId(id);
              const p = parts.find((pp) => pp.id === id);
              setRate(p?.installer_rate_per_m2 != null ? String(p.installer_rate_per_m2) : "");
            }}
            placeholder="Pay as product…"
          />
        </div>
        <input className={`${input} sm:col-span-2`} type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Qty" />
        <input className={`${input} sm:col-span-2`} type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="$ rate" aria-label="Pay rate" />
        <div className="col-span-2 text-right font-medium sm:col-span-3">{fmt((Number(qty) || 0) * (Number(rate) || 0))}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={approve} disabled={busy} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
          Approve &amp; add to pay
        </button>
        <input className={`${input} min-w-[10rem] flex-1`} placeholder="Reason if rejecting (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button onClick={reject} disabled={busy} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:opacity-60">
          Reject
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

/** Contractor-added items waiting for the office: approving makes them a normal, payable work order line. */
export default function ExtrasApproval({ extras, parts }: { extras: PendingExtra[]; parts: Part[] }) {
  if (extras.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border-2 border-[#f3b73a] bg-[#fff8e6] p-4">
      <div className="text-sm font-bold text-[#7a5a0f]">
        Contractor items awaiting your approval ({extras.length})
      </div>
      <p className="mt-0.5 text-xs text-[#7a5a0f]">
        Pick the product to pay it as and confirm the m²/qty and rate. Approved items are added to the work order and the payment totals below.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {extras.map((x) => (
          <Row key={x.id} x={x} parts={parts} />
        ))}
      </div>
    </div>
  );
}
