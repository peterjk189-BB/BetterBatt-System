import { createClient } from "@/lib/supabase/server";
import ContractorPaymentsTable from "./ContractorPaymentsTable";
import ExtrasApproval from "./ExtrasApproval";
import Link from "next/link";

export default async function ContractorPaymentsPage() {
  const supabase = await createClient();
  const [{ data: subs }, { data: lines }, { data: pendingExtras }, { data: parts }, runsRes] = await Promise.all([
    supabase
      .from("subcontractors")
      .select("id, name, phone, email, gst_registered, company_name, trading_name, abn, bank_account_name, bank_bsb, bank_account_number")
      .eq("archived", false)
      .order("name"),
    supabase
      .from("work_order_lines")
      .select(
        "*, parts(name, installer_rate_per_m2), work_orders(wo_number, contractor_id, archived, completed_date, projects(quote_number, revision_letter, address, suburb, customers(name))), labour_items(code, description, contractor_rate)"
      )
      .order("task_date", { ascending: false }),
    // Contractor-added items awaiting approval (empty until migration 0050 is run).
    supabase
      .from("work_order_extras")
      .select("id, work_order_id, subcontractor_id, description, qty, note, work_date, work_orders(wo_number, projects(address, suburb, customers(name))), subcontractors(name)")
      .eq("status", "Pending")
      .order("created_at"),
    supabase.from("parts").select("id, name, installer_rate_per_m2").eq("archived", false).order("name"),
    // Pay runs (migration 0103): the open run plus recent paid runs.
    supabase.from("contractor_pay_runs").select("id, pay_date, status, paid_at, emailed_at, emailed_to").order("pay_date", { ascending: false }).limit(52),
  ]);

  return (
    <>
      <div className="mb-4 flex justify-end print:hidden">
        <Link href="/dashboard/contractor-payments/invoices" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          Contractor tax invoices
        </Link>
      </div>
      <div className="print:hidden">
        <ExtrasApproval extras={(pendingExtras ?? []) as any} parts={(parts ?? []) as any} />
      </div>
      <ContractorPaymentsTable subs={subs ?? []} lines={(lines ?? []) as any} runs={(runsRes.data ?? []) as any} runsOk={!runsRes.error} />
    </>
  );
}
