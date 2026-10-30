import { fmtAbn } from "@/lib/contractorInvoice";

export type PaperInvoice = {
  invoice_number: string | null;
  date: string; // ISO date or timestamp
  contractor_name: string;
  contractor_abn: string | null;
  gst_registered: boolean;
  bank_account_name: string | null;
  bank_bsb: string | null;
  bank_account_number: string | null;
  site: string | null;
  wo_number: string | null;
  completed_date: string | null;
  lines: { description: string; qty: number; unit: string; rate: number; amount: number }[];
  unapproved_extras: { description: string; qty: number }[];
  subtotal_ex: number;
  gst: number;
  total: number;
  swms_ok: boolean;
  inspection_ok: boolean;
  note?: string | null;
};

const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const d = (s: string | null | undefined) => (s ? new Date(s.length > 10 ? s : s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");

/** The tax invoice itself, on a white sheet. Shared by the contractor's preview and the office's review. */
export default function InvoicePaper({ inv, company }: { inv: PaperInvoice; company: { name: string; abn: string | null } }) {
  const bankLast = inv.bank_account_number ? inv.bank_account_number : "";
  return (
    <div className="paper-sheet rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[#201f1c]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-2xl font-extrabold tracking-tight">TAX INVOICE</div>
        <div className="text-right text-sm">
          {inv.invoice_number ? (
            <div>
              Invoice no. <strong>{inv.invoice_number}</strong>
            </div>
          ) : (
            <div className="text-[#6b6862]">Number is given when you submit</div>
          )}
          <div>
            Date <strong>{d(inv.date)}</strong>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6862]">From</div>
          <div className="font-semibold">{inv.contractor_name}</div>
          {inv.contractor_abn && <div>ABN {fmtAbn(inv.contractor_abn)}</div>}
          <div className="text-[#6b6862]">{inv.gst_registered ? "Registered for GST" : "Not registered for GST"}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6862]">To</div>
          <div className="font-semibold">{company.name}</div>
          {company.abn && <div>ABN {fmtAbn(company.abn)}</div>}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6862]">Job</div>
          <div>{inv.wo_number ? `WO${inv.wo_number}` : ""}</div>
          <div>{inv.site}</div>
          {inv.completed_date && <div className="text-[#6b6862]">Completed {d(inv.completed_date)}</div>}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[440px]">
          <thead>
            <tr className="border-b-2 border-[#201f1c] text-left text-[11px] uppercase tracking-wide text-[#6b6862]">
              <th className="py-1.5">Description</th>
              <th className="py-1.5 text-right">Qty</th>
              <th className="py-1.5 text-right">Rate</th>
              <th className="py-1.5 text-right">Amount ex GST</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-[#d9d6cd]">
                <td className="py-1.5">{l.description}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {l.qty} {l.unit}
                </td>
                <td className="py-1.5 text-right tabular-nums">{money(l.rate)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
            {inv.lines.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-[#6b6862]">
                  Nothing to invoice yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ml-auto mt-3 w-full max-w-[290px] tabular-nums">
        <div className="flex justify-between py-0.5">
          <span>Subtotal</span>
          <span>{money(inv.subtotal_ex)}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>GST (10%)</span>
          <span>{inv.gst_registered ? money(inv.gst) : "Not applicable"}</span>
        </div>
        <div className="mt-1 flex justify-between border-t-2 border-[#201f1c] pt-1.5 text-base font-bold">
          <span>{inv.gst_registered ? "Total inc GST" : "Total"}</span>
          <span>{money(inv.total)}</span>
        </div>
      </div>

      {inv.unapproved_extras.length > 0 && (
        <div className="mt-4 rounded-md border border-dashed border-[#b3321f] bg-[#fdf1ee] px-3 py-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#b3321f]">Unapproved extras: not included in the total above</div>
          {inv.unapproved_extras.map((x, i) => (
            <div key={i} className="mt-1 flex flex-wrap justify-between gap-2">
              <span>
                {x.description} <span className="text-[#6b6862]">× {x.qty}</span>
              </span>
              <span className="font-semibold text-[#b3321f]">Awaiting approval</span>
            </div>
          ))}
          <div className="mt-1 text-xs text-[#6b6862]">Paid only once Better Batt approves it. An approved extra is invoiced on a follow-up tax invoice.</div>
        </div>
      )}

      {inv.note && <div className="mt-3 text-[#444]">Note: {inv.note}</div>}

      <div className="mt-4 border-t border-[#d9d6cd] pt-3 text-xs text-[#6b6862]">
        {inv.bank_bsb || bankLast ? (
          <div>
            Payment to: {inv.bank_account_name || inv.contractor_name} · BSB {inv.bank_bsb || "—"} · Account {bankLast ? "ending " + bankLast.slice(-4) : "—"}
          </div>
        ) : null}
        <div>
          SWMS {inv.swms_ok ? "signed" : "not signed"} · Inspection {inv.inspection_ok ? "passed" : "not passed"}
        </div>
      </div>
    </div>
  );
}
