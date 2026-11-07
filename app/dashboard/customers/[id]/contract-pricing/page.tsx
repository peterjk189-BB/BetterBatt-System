import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import ContractPricing from "./ContractPricing";

export default async function ContractPricingPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const role = await getEffectiveRole();
  // Office/admin only: contractors never see builder rates or margins.
  if (role !== "admin" && role !== "office") redirect("/dashboard");

  const [{ data: customer }, { data: parts }, { data: suppliers }, rates] = await Promise.all([
    supabase.from("customers").select("id, name, category").eq("id", params.id).single(),
    supabase
      .from("parts")
      .select("id, name, code, supplier_id, coverage_m2, pack_cost_ex_gst, installer_rate_per_m2, supply_install_rate_per_m2, is_stock_item")
      .eq("archived", false)
      .order("name"),
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
    supabase.from("customer_contract_rates").select("*").eq("customer_id", params.id).eq("archived", false),
  ]);
  if (!customer) notFound();

  return (
    <ContractPricing
      customer={customer as any}
      parts={(parts ?? []) as any}
      suppliers={suppliers ?? []}
      initialRates={(rates.data ?? []) as any}
      tableMissing={!!rates.error}
    />
  );
}
