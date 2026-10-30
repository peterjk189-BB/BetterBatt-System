import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import ContractorInvoicesTable from "./ContractorInvoicesTable";

export const dynamic = "force-dynamic";

export default async function ContractorInvoicesPage() {
  const role = await getEffectiveRole();
  if (role !== "admin" && role !== "office") redirect("/dashboard");
  const supabase = await createClient();
  const [invRes, { data: settings }, { data: pending }] = await Promise.all([
    supabase.from("contractor_invoices").select("*").order("submitted_at", { ascending: false }),
    supabase.from("company_settings").select("abn").limit(1),
    supabase.from("work_order_extras").select("work_order_id, subcontractor_id").eq("status", "Pending"),
  ]);
  const pendingKey: Record<string, number> = {};
  for (const e of (pending ?? []) as any[]) {
    const k = `${e.work_order_id}|${e.subcontractor_id}`;
    pendingKey[k] = (pendingKey[k] || 0) + 1;
  }
  return (
    <div>
      <Link href="/dashboard/contractor-payments" className="text-sm text-[var(--muted)] hover:underline">
        &larr; Contractor payments
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Contractor tax invoices</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Invoices contractors submitted from finished work orders. Check them, approve for payment, then mark them paid.
      </p>
      {invRes.error ? (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
          Contractor invoicing isn&apos;t set up yet. Run migration 0079 in Supabase to switch it on.
        </div>
      ) : (
        <ContractorInvoicesTable
          initial={(invRes.data ?? []) as any}
          pendingExtras={pendingKey}
          company={{ name: "Better Batt Insulation", abn: ((settings ?? [])[0] as any)?.abn ?? null }}
        />
      )}
    </div>
  );
}
