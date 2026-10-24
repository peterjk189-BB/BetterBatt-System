import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import DaySheet from "./DaySheet";

export default async function DaySheetPage({ searchParams }: { searchParams: { date?: string; contractor_id?: string } }) {
  const role = await getEffectiveRole();
  if (role === "installer") redirect("/dashboard/calendar");

  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date || "") ? (searchParams.date as string) : today;

  const [{ data: lines }, { data: contractors }] = await Promise.all([
    supabase
      .from("work_order_lines")
      .select(
        "*, parts(name, is_stock_item), labour_items(code, description), subcontractors(id, name, phone), work_orders(id, wo_number, archived, notes, subcontractors(id, name, phone), projects(quote_number, lot_no, address, suburb, contact_name, contact_phone, customers(name)))"
      )
      .eq("task_date", date),
    supabase.from("subcontractors").select("id, name").order("name"),
  ]);

  const rows = ((lines ?? []) as any[])
    .filter((l) => l.work_orders && !l.work_orders.archived)
    .map((l) => {
      const c = l.subcontractors || l.work_orders.subcontractors;
      return { ...l, contractor: c ? { id: c.id as string, name: c.name as string, phone: (c.phone as string) || null } : null };
    })
    .filter((l) => !searchParams.contractor_id || l.contractor?.id === searchParams.contractor_id)
    .sort(
      (a, b) =>
        String(a.task_time || "99:99").localeCompare(String(b.task_time || "99:99")) ||
        String(a.contractor?.name || "").localeCompare(String(b.contractor?.name || "")) ||
        Number(a.work_orders.wo_number) - Number(b.work_orders.wo_number)
    );

  // Only offer contractors who actually have work that day.
  const dayContractors = new Map<string, string>();
  for (const l of (lines ?? []) as any[]) {
    const c = l.subcontractors || l.work_orders?.subcontractors;
    if (c?.id && l.work_orders && !l.work_orders.archived) dayContractors.set(c.id, c.name);
  }

  return (
    <DaySheet
      date={date}
      contractorId={searchParams.contractor_id || ""}
      contractors={Array.from(dayContractors.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))}
      rows={rows as any}
      allContractorsCount={(contractors ?? []).length}
    />
  );
}
