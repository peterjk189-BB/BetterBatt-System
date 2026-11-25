import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Calculator from "./Calculator";

export default async function CalculatorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("profiles").select("role").eq("id", user.id).single() : { data: null };
  const canInvoice = me?.role === "admin" || me?.role === "office";
  if (!user) return null;
  // select("*") so the Retail / Trade / Regency prices are picked up whether or not those columns exist yet.
  // Read with the admin client: only admin and office logins can read Inventory, but anyone given this tab
  // (supervisors, warehouse) needs the product list. Only names, coverage and sell prices are passed on, never costs.
  const { data: parts } = await createAdminClient().from("parts").select("*").eq("archived", false).order("name");
  const usable = ((parts ?? []) as any[])
    .filter((p) => Number(p.coverage_m2) > 0 && p.is_stock_item !== false && !/delivery/i.test(p.name || ""))
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      coverage_m2: Number(p.coverage_m2),
      supply_charge_per_pack: Number(p.supply_charge_per_pack) || 0,
      price_retail: Number(p.price_retail) || 0,
      price_trade: Number(p.price_trade) || 0,
      price_regency: Number(p.price_regency) || 0,
    }));
  return <Calculator parts={usable} canInvoice={canInvoice} />;
}
