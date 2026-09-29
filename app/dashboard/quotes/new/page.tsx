import { createClient } from "@/lib/supabase/server";
import QuoteEditor from "../QuoteEditor";

export default async function NewQuotePage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: parts }] = await Promise.all([
    supabase.from("customers").select("*").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
  ]);

  return <QuoteEditor project={null} lines={[]} customers={customers ?? []} parts={parts ?? []} />;
}
