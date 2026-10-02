import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuditLogTable from "./AuditLogTable";

export default async function AuditLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (myProfile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: events } = await supabase
    .from("audit_log")
    .select("id, created_at, user_id, user_name, event_type, entity_type, entity_id, entity_label, details")
    .order("created_at", { ascending: false })
    .limit(1000);

  return <AuditLogTable initial={events ?? []} />;
}
