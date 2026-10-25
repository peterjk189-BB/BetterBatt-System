import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ALL_TABS } from "@/lib/tabs";
import { resolveTabsForRequest } from "@/lib/preview";
import SignOutButton from "./SignOutButton";
import NavTabs from "./NavTabs";
import Sidebar from "./Sidebar";
import SelectNumberOnFocus from "./SelectNumberOnFocus";
import PushToggle from "./PushToggle";
import ThemeToggle from "./ThemeToggle";
import AccessGuard from "./AccessGuard";
import PreviewBar from "./PreviewBar";
import QuickEnquiry from "./crm/QuickEnquiry";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, allowed_tabs")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";
  const isOffice = profile?.role === "office";

  const { tabs: myTabs, previewing } = await resolveTabsForRequest(
    profile?.role,
    profile?.allowed_tabs ?? null,
    user.id
  );
  const navLinks = ALL_TABS.filter((t) => myTabs.includes(t.key)).map((t) => ({
    key: t.key,
    href: t.href,
    label: t.label,
    group: t.group,
  }));
  const allowedHrefs: string[] = navLinks.map((l) => l.href);
  // Statements live under the Invoices tab (no tab of their own).
  if (allowedHrefs.includes("/dashboard/invoices")) allowedHrefs.push("/dashboard/statements");
  const hasAnyTab = myTabs.length > 0;

  let previewOptions: { id: string; label: string }[] = [];
  if (isAdmin) {
    const { data: otherProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .neq("id", user.id)
      .order("full_name");
    previewOptions = (otherProfiles ?? []).map((p) => ({
      id: p.id,
      label: `${p.full_name || "Unnamed user"} (${p.role})`,
    }));
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] print:hidden">
        <div className="flex w-full items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="font-bold">
            Better Batt System
          </Link>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            {isAdmin && <PreviewBar users={previewOptions} previewing={previewing} />}
            <span>
              {profile?.full_name || user.email}
              {isAdmin ? " (admin)" : isOffice ? " (office)" : " (installer)"}
            </span>
            <ThemeToggle />
            <PushToggle />
            <SignOutButton />
          </div>
        </div>
        {hasAnyTab && (
          <div className="w-full px-6 pb-3 sm:hidden">
            <NavTabs links={navLinks} />
          </div>
        )}
      </header>
      <div className="flex w-full items-start">
        {hasAnyTab && <Sidebar links={navLinks} />}
        <main className="min-w-0 flex-1 px-6 py-8">
          <AccessGuard allowedHrefs={allowedHrefs} />
          <SelectNumberOnFocus />
          {children}
          {myTabs.includes("crm") && !previewing && <QuickEnquiry userId={user.id} />}
        </main>
      </div>
    </div>
  );
}
