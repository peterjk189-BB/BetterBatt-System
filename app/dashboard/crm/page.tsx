import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CrmHome from "./CrmHome";

export default async function CrmPage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: leads }, { data: tasks }, { data: staff }, { data: customers }] = await Promise.all([
    supabase
      .from("crm_leads")
      .select("*, customers(name), projects(quote_number, outcome), site_visits(visit_number, status)")
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_tasks")
      .select("*, leads:crm_leads(name), customers(name)")
      .order("due_date", { ascending: true }),
    supabase.from("profiles").select("id, full_name, role").in("role", ["admin", "office"]).order("full_name"),
    supabase
      .from("customers")
      .select("id, name, category, contact_phone, checkin_every_days, last_contact_at, crm_owner_id")
      .eq("archived", false)
      .order("name"),
  ]);

  const tab = searchParams.tab === "tasks" || searchParams.tab === "accounts" || searchParams.tab === "calendar" ? searchParams.tab : "pipeline";

  return (
    <CrmHome
      userId={user.id}
      initialTab={tab}
      initialLeads={(leads ?? []) as any}
      initialTasks={(tasks ?? []) as any}
      staff={(staff ?? []) as any}
      customers={(customers ?? []) as any}
    />
  );
}
