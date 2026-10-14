import { createClient } from "@/lib/supabase/server";
import CountSheet from "./CountSheet";

export default async function CountSheetPage() {
  const supabase = await createClient();
  const [{ data: parts }, { data: suppliers }] = await Promise.all([
    supabase
      .from("parts")
      .select("id, code, name, supplier_id, pack_per_multi, multi, pks, stock_on_hand, is_stock_item")
      .eq("archived", false)
      .order("name"),
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
  ]);
  return <CountSheet parts={(parts ?? []) as any} suppliers={suppliers ?? []} />;
}
