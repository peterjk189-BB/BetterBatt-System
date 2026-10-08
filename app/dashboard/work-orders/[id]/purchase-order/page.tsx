import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import { siteAddress } from "@/lib/siteAddress";
import WoPurchaseOrder from "./WoPurchaseOrder";

export default async function WorkOrderPurchaseOrderPage({ params }: { params: { id: string } }) {
  const role = await getEffectiveRole();
  // Purchase orders are admin-only, same as the Purchase Orders section.
  if (role !== "admin") redirect(`/dashboard/work-orders/${params.id}`);

  const supabase = await createClient();
  const [{ data: wo }, { data: lines }, { data: others }, { data: parts }, { data: suppliers }, { data: reserved }, { data: drafts }] =
    await Promise.all([
      supabase
        .from("work_orders")
        .select("id, wo_number, projects(lot_no, address, suburb, customers(name))")
        .eq("id", params.id)
        .single(),
      supabase
        .from("work_order_lines")
        .select("id, qty, note, part_id, picked")
        .eq("work_order_id", params.id)
        .order("sort_order"),
      supabase
        .from("work_orders")
        .select("id, wo_number, projects(lot_no, address, suburb, customers(name))")
        .eq("archived", false)
        .neq("id", params.id)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("parts")
        .select("id, code, name, coverage_m2, pack_cost_ex_gst, supplier_id, stock_on_hand, is_stock_item")
        .eq("archived", false),
      supabase.from("suppliers").select("id, name").eq("archived", false).order("name"),
      supabase
        .from("work_order_lines")
        .select("work_order_id, part_id, qty, work_orders!inner(archived)")
        .eq("allocated", true)
        .eq("picked", false)
        .eq("work_orders.archived", false),
      supabase
        .from("purchase_orders")
        .select("id, po_number, supplier_id, delivery_date")
        .eq("status", "Draft")
        .eq("archived", false)
        .order("created_at", { ascending: false }),
    ]);

  if (!wo) notFound();

  const label = (w: any) => ({
    id: w.id as string,
    woNumber: w.wo_number as string,
    customer: (w.projects?.customers?.name as string | undefined) ?? "",
    address: siteAddress(w.projects),
  });

  return (
    <WoPurchaseOrder
      current={label(wo)}
      currentLines={(lines ?? []) as any}
      others={(others ?? []).map(label)}
      parts={(parts ?? []) as any}
      suppliers={suppliers ?? []}
      reserved={(reserved ?? []) as any}
      drafts={(drafts ?? []) as any}
    />
  );
}
