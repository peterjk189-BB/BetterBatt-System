import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LeadEditor from "./LeadEditor";

export default async function LeadPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: lead }, { data: tasks }, { data: activity }, { data: staff }, { data: customers }, { data: quotes }, { data: visits }] =
    await Promise.all([
      supabase
        .from("crm_leads")
        .select("*, customers(name), projects(quote_number, outcome), site_visits(visit_number, status)")
        .eq("id", params.id)
        .single(),
      supabase.from("crm_tasks").select("*").eq("lead_id", params.id).order("due_date"),
      supabase.from("crm_activity").select("*").eq("lead_id", params.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name").in("role", ["admin", "office"]).order("full_name"),
      supabase.from("customers").select("id, name").eq("archived", false).order("name"),
      supabase
        .from("projects")
        .select("id, quote_number, address, suburb, outcome, customers(name)")
        .eq("archived", false)
        .order("quote_number", { ascending: false })
        .limit(150),
      supabase
        .from("site_visits")
        .select("id, visit_number, visit_date, customer_name, suburb")
        .eq("archived", false)
        .order("visit_number", { ascending: false })
        .limit(150),
    ]);

  if (!lead) notFound();

  return (
    <LeadEditor
      userId={user.id}
      initialLead={lead as any}
      initialTasks={(tasks ?? []) as any}
      initialActivity={(activity ?? []) as any}
      staff={(staff ?? []) as any}
      customers={(customers ?? []) as any}
      quotes={(quotes ?? []) as any}
      visits={(visits ?? []) as any}
    />
  );
}
