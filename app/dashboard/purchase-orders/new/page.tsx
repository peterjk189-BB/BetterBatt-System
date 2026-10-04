import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import PurchaseOrderEditor from "../PurchaseOrderEditor";

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: { part_id?: string; qty?: string; supplier_id?: string; address?: string; note?: string };
}) {
  const supabase = await createClient();
  const [{ data: suppliers }, { data: parts }, role] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  const initial = searchParams.part_id
    ? {
        part_id: searchParams.part_id,
        qty_pks: searchParams.qty ? Number(searchParams.qty) : undefined,
        supplier_id: searchParams.supplier_id || undefined,
        delivery_address: searchParams.address || undefined,
        notes: searchParams.note || undefined,
      }
    : null;

  return (
    <PurchaseOrderEditor
      purchaseOrder={null}
      lines={[]}
      suppliers={suppliers ?? []}
      parts={parts ?? []}
      isAdmin={role === "admin"}
      initial={initial}
    />
  );
}
