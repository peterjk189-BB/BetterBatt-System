import { createClient } from "@/lib/supabase/server";
import CustomersTable from "./CustomersTable";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("*")
    .order("name");

  return <CustomersTable initial={data ?? []} />;
}
