import { createClient } from "@/lib/supabase/server";
import ContractorPaymentsTable from "./ContractorPaymentsTable";
import ExtrasApproval from "./ExtrasApproval";
import Link from "next/link";

export default async function ContractorPaymentsPage() {
  const supabase = await createClient();
  const [{ data: subs }, { data: lines }, { data: pendingExtras }, { data: parts }] = await Promise.all([
    supabase
      .from("subcontractors")
      .select("id, name, phone, email, gst_registered")
      .eq("archived", false)
      .order("name"),
    supabase
      .from("work_order_lines")
      .select(
        "*, parts(name, installer_rate_per_m2), work_orders(wo_number, contractor_id, archived, projects(quote_number, address, suburb, customers(name))), labour_items(code, description, contractor_rate)"
      )
      .order("task_date", { ascending: false }),
    // Contractor-added items awaiting approval (empty until migration 0050 is run).
    supabase
      .from("work_order_extras")
      .select("id, work_order_id, subcontractor_id, description, qty, note, work_date, work_orders(wo_number, projects(address, suburb, customers(name))), subcontractors(name)")
      .eq("status", "Pending")
      .order("created_at"),
    supabase.from("parts").select("id, name, installer_rate_per_m2").eq("archived", false).order("name"),
  ]);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Link href="/dashboard/contractor-payments/invoices" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          Contractor tax invoices
        </Link>
      </div>
      <ExtrasApproval extras={(pendingExtras ?? []) as any} parts={(parts ?? []) as any} />
      <ContractorPaymentsTable subs={subs ?? []} lines={(lines ?? []) as any} />
    </>
  );
}
