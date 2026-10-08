import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SubcontractorsTable from "./SubcontractorsTable";

export default async function SubcontractorsPage() {
  const supabase = await createClient();
  const [{ data }, { data: photos }, role] = await Promise.all([
    supabase.from("subcontractors").select("*").order("name"),
    supabase
      .from("attachments")
      .select("subcontractor_id, storage_path, created_at")
      .eq("category", "Profile Photo")
      .not("subcontractor_id", "is", null)
      .order("created_at", { ascending: false }),
    getEffectiveRole(),
  ]);
  // Onboarding applications are admin-only (ID photos + banking details).
  let invites: any[] = [];
  if (role === "admin") {
    const { data: inv } = await supabase
      .from("subcontractor_invites")
      .select("*")
      .in("status", ["Sent", "Submitted"])
      .order("created_at", { ascending: false });
    invites = inv ?? [];
  }
  return <SubcontractorsTable initial={data ?? []} photos={photos ?? []} isAdmin={role === "admin"} invites={invites} />;
}
