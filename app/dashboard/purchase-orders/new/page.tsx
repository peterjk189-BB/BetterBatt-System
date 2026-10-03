import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import PurchaseOrderEditor from "../PurchaseOrderEditor";

export default async function NewPurchaseOrderPage() {
  const supabase = await createClient();
  const [{ data: suppliers }, { data: parts }, role] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  return (
    <PurchaseOrderEditor
      purchaseOrder={null}
      lines={[]}
      suppliers={suppliers ?? []}
      parts={parts ?? []}
      isAdmin={role === "admin"}
    />
  );
}
