import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/currentUser";
import PurchaseOrderEditor from "../PurchaseOrderEditor";

export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: purchaseOrder }, { data: lines }, { data: suppliers }, { data: parts }, role] = await Promise.all([
    supabase.from("purchase_orders").select("*").eq("id", params.id).single(),
    supabase.from("purchase_order_lines").select("*").eq("purchase_order_id", params.id),
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
    getCurrentUserRole(),
  ]);

  if (!purchaseOrder) notFound();

  return (
    <PurchaseOrderEditor
      purchaseOrder={purchaseOrder}
      lines={lines ?? []}
      suppliers={suppliers ?? []}
      parts={parts ?? []}
      isAdmin={role === "admin"}
    />
  );
}
