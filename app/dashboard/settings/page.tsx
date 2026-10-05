import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./SettingsForm";
import InspectionEmailsForm from "./InspectionEmailsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (myProfile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: settings } = await supabase.from("company_settings").select("*").eq("id", true).single();

  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Company-wide settings for the app.</p>

      <InspectionEmailsForm initial={settings?.inspection_notify_emails ?? ""} />
      <SettingsForm initialTerms={settings?.terms_and_conditions ?? ""} />
    </div>
  );
}
