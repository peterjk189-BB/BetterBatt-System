import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveRole, getEffectiveSubcontractorId } from "@/lib/currentUser";
import { buildInvoiceDraft } from "@/lib/contractorInvoice";
import InvoicePaper, { type PaperInvoice } from "../../InvoicePaper";
import SubmitInvoice from "./SubmitInvoice";

const STATUS_STYLE: Record<string, string> = {
  Submitted: "bg-amber-100 text-amber-800",
  Approved: "bg-green-100 text-green-800",
  Paid: "bg-blue-100 text-blue-800",
  Rejected: "bg-red-100 text-red-800",
};

export const dynamic = "force-dynamic";

export default async function ContractorInvoicePage({ params }: { params: { id: string } }) {
  if ((await getEffectiveRole()) !== "installer") redirect(`/dashboard/work-orders/${params.id}`);
  const subId = await getEffectiveSubcontractorId();
  const supabase = await createClient();
  const { data: wo } = await supabase.from("work_orders").select("id, wo_number").eq("id", params.id).single();
  if (!wo || !subId) notFound();

  const admin = createAdminClient();
  const [{ data: sub }, { data: settings }, { data: saved }] = await Promise.all([
    admin.from("subcontractors").select("invoicing_enabled").eq("id", subId).single(),
    admin.from("company_settings").select("abn").limit(1),
    supabase.from("contractor_invoices").select("*").eq("work_order_id", params.id).eq("subcontractor_id", subId).order("seq", { ascending: false }),
  ]);
  const company = { name: "Better Batt Insulation", abn: ((settings ?? [])[0] as any)?.abn ?? null };
  const enabled = !!(sub as any)?.invoicing_enabled;
  const built = enabled ? await buildInvoiceDraft(admin, params.id, subId) : null;
  const draft = built?.draft;
  const open = !!draft && draft.lines.length > 0;
  const ready = !!draft && draft.swms_ok && draft.inspection_ok && open;

  const asPaper = (inv: any): PaperInvoice => ({ ...inv, date: inv.submitted_at });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/work-orders/${params.id}`} className="text-sm text-[var(--muted)] hover:underline">
        &larr; Work order {(wo as any).wo_number}
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Tax invoice: work order {(wo as any).wo_number}</h1>

      {!enabled && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
          Tax invoicing isn&apos;t switched on for your account. If you&apos;d like to invoice through the app, ask the office to turn it on.
        </div>
      )}

      {((saved ?? []) as any[]).map((inv) => (
        <div key={inv.id} className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Invoice {inv.invoice_number}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[inv.status] || ""}`}>
              {inv.status === "Submitted" ? "Submitted: waiting for approval" : inv.status}
            </span>
          </div>
          {inv.status === "Rejected" && inv.reject_reason && <p className="mb-2 text-sm text-red-700">Office: {inv.reject_reason}</p>}
          <InvoicePaper inv={asPaper(inv)} company={company} />
        </div>
      ))}

      {enabled && draft && (
        <div className="mt-8">
          <h2 className="text-lg font-bold">{(saved ?? []).length > 0 ? "New invoice" : "Your invoice"}</h2>
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span className={draft.swms_ok ? "text-green-700" : "text-red-700"}>{draft.swms_ok ? "✓" : "✗"}</span> SWMS signed
              {!draft.swms_ok && <span className="text-[var(--muted)]">: start or finish the SWMS for this job</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className={draft.inspection_ok ? "text-green-700" : "text-red-700"}>{draft.inspection_ok ? "✓" : "✗"}</span> Inspection passed
              {!draft.inspection_ok && <span className="text-[var(--muted)]">: the office books the inspection once the SWMS is in</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className={open ? "text-green-700" : "text-[var(--muted)]"}>{open ? "✓" : "–"}</span> {open ? "Work on this job to invoice" : "Nothing left to invoice on this job"}
            </div>
          </div>

          {open && (
            <div className="mt-4">
              <InvoicePaper inv={{ ...draft, invoice_number: null, date: new Date().toISOString() }} company={company} />
              {!draft.contractor_abn && <p className="mt-3 text-sm text-red-700">Your ABN isn&apos;t on file. Ask the office to add it before you can invoice.</p>}
              {ready && draft.contractor_abn ? (
                <SubmitInvoice workOrderId={params.id} hasExtras={draft.unapproved_extras.length > 0} />
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">The Submit button appears once the SWMS is signed and the inspection has passed.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
