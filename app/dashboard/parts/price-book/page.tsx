import { createClient } from "@/lib/supabase/server";
import PriceBook from "./PriceBook";

export default async function PriceBookPage() {
  const supabase = await createClient();
  const [{ data: parts }, { data: suppliers }] = await Promise.all([
    supabase
      .from("parts")
      .select("id, code, name, type, supplier_id, coverage_m2, pack_cost_ex_gst, price_retail, price_trade, price_regency, is_stock_item")
      .eq("archived", false)
      .order("name"),
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
  ]);

  return <PriceBook parts={(parts ?? []) as any} suppliers={suppliers ?? []} />;
}
