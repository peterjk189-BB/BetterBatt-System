import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import WorkOrderEditor from "../WorkOrderEditor";

export default async function WorkOrderPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [
    { data: workOrder },
    { data: lines },
    { data: projects },
    { data: subs },
    { data: labourItems },
    { data: parts },
    role,
  ] = await Promise.all([
    supabase.from("work_orders").select("*").eq("id", params.id).single(),
    supabase.from("work_order_lines").select("*").eq("work_order_id", params.id).order("sort_order"),
    supabase
      .from("projects")
      .select("id, quote_number, address, suburb, job_type, quote_markup, customers(name)")
      .eq("archived", false)
      .order("quote_number", { ascending: false }),
    supabase.from("subcontractors").select("id, name, phone, email").eq("archived", false).order("name"),
    supabase.from("labour_items").select("*").eq("archived", false).order("code"),
    supabase.from("parts").select("id, name, coverage_m2, supply_charge_per_pack, supply_install_rate_per_m2"),
    getEffectiveRole(),
  ]);

  if (!workOrder) notFound();

  return (
    <WorkOrderEditor
      workOrder={workOrder}
      lines={lines ?? []}
      prefillHeader={null}
      projects={(projects ?? []) as any}
      subs={subs ?? []}
      labourItems={labourItems ?? []}
      parts={parts ?? []}
      isAdmin={role === "admin"}
    />
  );
}
