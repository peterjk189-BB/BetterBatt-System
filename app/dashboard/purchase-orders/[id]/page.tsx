import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import PurchaseOrderEditor from "../PurchaseOrderEditor";

export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: purchaseOrder }, { data: lines }, { data: suppliers }, { data: parts }, role] = await Promise.all([
    supabase.from("purchase_orders").select("*").eq("id", params.id).single(),
    supabase.from("purchase_order_lines").select("*").eq("purchase_order_id", params.id),
    supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
    getEffectiveRole(),
  ]);

  if (!purchaseOrder) notFound();

  // Which job each line is for (only present once lines have been drafted from a work order).
  const jobIds = Array.from(new Set((lines ?? []).map((l: any) => l.work_order_id).filter(Boolean))) as string[];
  const { data: jobs } = jobIds.length > 0 ? await supabase.from("work_orders").select("id, wo_number").in("id", jobIds) : { data: [] as any[] };
  const woNumbers: Record<string, string> = Object.fromEntries((jobs ?? []).map((j: any) => [j.id, j.wo_number]));

  return (
    <PurchaseOrderEditor
      purchaseOrder={purchaseOrder}
      lines={lines ?? []}
      suppliers={suppliers ?? []}
      parts={parts ?? []}
      isAdmin={role === "admin"}
      woNumbers={woNumbers}
    />
  );
}
