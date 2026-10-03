"use client";

import { Fragment, useState } from "react";

type Line = {
  part_id: string | null;
  qty_m2: number;
  note: string | null;
  parts: {
    name: string;
    coverage_m2: number;
    supply_charge_per_pack: number;
    supply_install_rate_per_m2: number;
  } | null;
};

type Project = {
  id: string;
  quote_number: number;
  job_type: string;
  lot_no: string | null;
  address: string | null;
  suburb: string | null;
  entry_date: string;
  notes: string | null;
  quote_markup: number;
  show_qty_on_quote: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  customers: { name: string; discount_pct: number | null } | null;
};

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export default function PublicQuoteView({
  project,
  lines,
  termsAndConditions,
  token,
}: {
  project: Project;
  lines: Line[];
  termsAndConditions?: string;
  token: string;
}) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [acceptedNow, setAcceptedNow] = useState<{ accepted_at: string; accepted_name: string } | null>(null);

  const isSupplyOnly = project.job_type === "SUPPLY ONLY";
  const isDeliveryItem = (itemName: string | undefined) => /delivery/i.test(itemName || "");

  const computed = lines.map((l) => {
    const part = l.parts;
    if (!part) return { ...l, packs: 0, charge: 0, isDelivery: false };
    const packs = part.coverage_m2 > 0 ? Math.ceil(l.qty_m2 / part.coverage_m2) : 0;
    const usedForCal = packs * part.coverage_m2;
    const charge = isSupplyOnly ? packs * part.supply_charge_per_pack : usedForCal * part.supply_install_rate_per_m2;
    return { ...l, packs, charge, isDelivery: isDeliveryItem(part.name) };
  });

  const customerDiscountPct = project.customers?.discount_pct || 0;
  const chargeBeforeMarkup = computed.reduce((s, l) => s + l.charge, 0);
  const customerDiscountTotal = chargeBeforeMarkup * (customerDiscountPct / 100);
  const subtotal = chargeBeforeMarkup - customerDiscountTotal + Number(project.quote_markup || 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;

  const accepted = acceptedNow || (project.accepted_at ? { accepted_at: project.accepted_at, accepted_name: project.accepted_name || "" } : null);

  async function submitAccept() {
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!agreed) {
      setError("Please tick the box to confirm you accept this quote.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/quote-accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setAcceptedNow({ accepted_at: data.accepted_at, accepted_name: name.trim() });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f2f0ec] px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-xl border border-[#e4e1da] bg-white p-6 text-[#201f1c] sm:p-10">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#141413] px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center rounded-lg bg-white px-2.5 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Better Batt Insulation"
                className="h-9 w-auto object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div>
              <div className="text-xl font-extrabold text-white">Better Batt Insulation</div>
              <div className="mt-0.5 text-[11px] text-gray-300">Insulation supply &amp; install</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-gray-300">Quote</div>
            <div className="text-2xl font-extrabold text-white">Q{project.quote_number}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-[#f6f5f2] px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-wider text-[#8c887f]">Customer</div>
            <div className="mt-0.5 text-[13px] font-bold">{project.customers?.name || "—"}</div>
            {(project.contact_name || project.contact_phone) && (
              <div className="mt-0.5 text-xs text-[#6b6862]">
                {[project.contact_name, project.contact_phone].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-[#f6f5f2] px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-wider text-[#8c887f]">Date</div>
            <div className="mt-0.5 text-[13px] font-bold">
              {project.entry_date ? new Date(project.entry_date).toLocaleDateString("en-AU") : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-[#f6f5f2] px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-wider text-[#8c887f]">Site</div>
            <div className="mt-0.5 text-[13px] font-bold">
              {[project.lot_no && `Lot ${project.lot_no}`, project.address, project.suburb].filter(Boolean).join(", ") || "—"}
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-[#f6f5f2] text-left text-[9px] uppercase tracking-wider text-[#8c887f]">
                <th className="rounded-l-lg px-2.5 py-2 font-semibold">Product</th>
                {project.show_qty_on_quote && <th className="px-2.5 py-2 text-right font-semibold">Qty (m²)</th>}
                <th className="rounded-r-lg px-2.5 py-2 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {computed.map((l, i) => (
                <Fragment key={i}>
                  <tr className={l.note ? "" : "border-b border-gray-300"}>
                    <td className="px-2.5 py-1.5">{l.parts?.name || "—"}</td>
                    {project.show_qty_on_quote && <td className="px-2.5 py-1.5 text-right">{l.qty_m2} m²</td>}
                    <td className="px-2.5 py-1.5 text-right font-medium">{l.isDelivery ? "" : fmtCurrency(l.charge)}</td>
                  </tr>
                  {l.note && (
                    <tr className="border-b border-gray-300">
                      <td colSpan={project.show_qty_on_quote ? 3 : 2} className="px-2.5 pb-1.5 text-xs italic text-[#6b6862]">
                        {l.note}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {computed.length === 0 && (
                <tr>
                  <td colSpan={project.show_qty_on_quote ? 3 : 2} className="py-6 text-center text-gray-500">
                    No line items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {project.notes && (
          <div className="mt-4 rounded-lg bg-[#f6f5f2] px-3.5 py-2.5 text-xs text-[#6b6862]">{project.notes}</div>
        )}

        <div className="mt-4 flex justify-end">
          <div className="w-full rounded-lg bg-[#f6f5f2] p-3.5 sm:w-64">
            <div className="flex justify-between py-0.5 text-sm text-[#6b6862]">
              <span>Subtotal</span>
              <span className="text-[#201f1c]">{fmtCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-sm text-[#6b6862]">
              <span>GST (10%)</span>
              <span className="text-[#201f1c]">{fmtCurrency(gst)}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t border-[#e4e1da] pt-2 text-base font-extrabold">
              <span>Total</span>
              <span>{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>

        {termsAndConditions && termsAndConditions.trim() && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8c887f]">Terms &amp; Conditions</div>
            <div className="mt-2 space-y-1.5">
              {termsAndConditions
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p key={i} className="text-[9.5px] leading-relaxed text-[#6b6862]">
                    {paragraph}
                  </p>
                ))}
            </div>
          </div>
        )}

        {/* Acceptance */}
        <div className="mt-6 rounded-xl border border-[#e4e1da] bg-[#fdf8ec] p-5">
          {accepted ? (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">✓</div>
              <div>
                <div className="font-semibold text-[#201f1c]">Quote accepted</div>
                <div className="text-sm text-[#6b6862]">
                  Signed by {accepted.accepted_name} on {new Date(accepted.accepted_at).toLocaleString("en-AU")}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="font-semibold text-[#201f1c]">Accept this quote</div>
              <p className="mt-1 text-xs text-[#6b6862]">
                By typing your name below and ticking the box, you accept this quote and its total of{" "}
                {fmtCurrency(total)} (including GST), and agree to the terms &amp; conditions above.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="rounded-lg border border-[#e4e1da] bg-white px-3 py-2 text-sm"
                />
                <label className="flex items-start gap-2 text-sm text-[#6b6862]">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5"
                  />
                  I have read and accept this quote and the terms &amp; conditions above.
                </label>
                {error && <div className="text-sm text-red-700">{error}</div>}
                <button
                  onClick={submitAccept}
                  disabled={submitting}
                  className="self-start rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Accept quote"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-between border-t border-gray-100 pt-3 text-[10px] text-[#9a968d]">
          <span>Better Batt Insulation</span>
          <span>Thank you for the opportunity to quote.</span>
        </div>
      </div>
    </div>
  );
}
