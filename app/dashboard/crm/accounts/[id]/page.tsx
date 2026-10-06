import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountView from "./AccountView";

export default async function AccountPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: customer }, { data: quotes }, { data: visits }, { data: leads }, { data: tasks }, { data: activity }, { data: staff }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, category, contact_name, contact_phone, contact_email, checkin_every_days, last_contact_at, crm_owner_id")
        .eq("id", params.id)
        .single(),
      supabase
        .from("projects")
        .select("id, quote_number, address, suburb, outcome, entry_date")
        .eq("customer_id", params.id)
        .eq("archived", false)
        .order("quote_number", { ascending: false }),
      supabase
        .from("site_visits")
        .select("id, visit_number, visit_date, status, address, suburb")
        .eq("customer_id", params.id)
        .eq("archived", false)
        .order("visit_date", { ascending: false }),
      supabase
        .from("crm_leads")
        .select("id, lead_number, name, stage, created_at")
        .eq("customer_id", params.id)
        .eq("archived", false)
        .order("created_at", { ascending: false }),
      supabase.from("crm_tasks").select("*").eq("customer_id", params.id).order("due_date"),
      supabase.from("crm_activity").select("*").eq("customer_id", params.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name").in("role", ["admin", "office"]).order("full_name"),
    ]);

  if (!customer) notFound();

  return (
    <AccountView
      userId={user.id}
      initialCustomer={customer as any}
      quotes={(quotes ?? []) as any}
      visits={(visits ?? []) as any}
      leads={(leads ?? []) as any}
      initialTasks={(tasks ?? []) as any}
      initialActivity={(activity ?? []) as any}
      staff={(staff ?? []) as any}
    />
  );
}
