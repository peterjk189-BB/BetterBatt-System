import { createClient } from "@/lib/supabase/server";
import Calculator from "./Calculator";

export default async function CalculatorPage() {
  const supabase = await createClient();
  // select("*") so the Retail / Trade / Regency prices are picked up whether or not those columns exist yet.
  const { data: parts } = await supabase.from("parts").select("*").eq("archived", false).order("name");
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
  return <Calculator parts={usable} />;
}
