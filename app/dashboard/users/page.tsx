import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import UsersTable from "./UsersTable";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (myProfile?.role !== "admin") {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const [{ data: authUsers }, { data: profiles }, { data: subs }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 200 }),
    supabase.from("profiles").select("id, full_name, role, subcontractor_id"),
    supabase.from("subcontractors").select("id, name").eq("archived", false).order("name"),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const users = (authUsers?.users ?? [])
    .map((u) => {
      const profile = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email || "—",
        full_name: profile?.full_name || (u.user_metadata?.full_name as string) || "",
        role: (profile?.role as "admin" | "office" | "installer") || "installer",
        subcontractor_id: profile?.subcontractor_id || null,
        last_sign_in_at: u.last_sign_in_at || null,
        invited_at: u.invited_at || null,
        confirmed_at: u.email_confirmed_at || null,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <UsersTable initial={users} subcontractors={subs ?? []} currentUserId={user.id} />
  );
}
