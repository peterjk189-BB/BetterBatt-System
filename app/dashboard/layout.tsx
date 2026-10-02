import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ALL_TABS, effectiveTabs } from "@/lib/tabs";
import SignOutButton from "./SignOutButton";
import NavTabs from "./NavTabs";
import AccessGuard from "./AccessGuard";

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

  const myTabs = effectiveTabs(profile?.role, profile?.allowed_tabs ?? null);
  const navLinks = ALL_TABS.filter((t) => myTabs.includes(t.key)).map((t) => ({ href: t.href, label: t.label }));
  const allowedHrefs = navLinks.map((l) => l.href);
  const hasAnyTab = myTabs.length > 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] print:hidden">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="font-bold">
            Better Batt System
          </Link>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <span>
              {profile?.full_name || user.email}
              {isAdmin ? " (admin)" : isOffice ? " (office)" : " (installer)"}
            </span>
            <SignOutButton />
          </div>
        </div>
        {hasAnyTab && (
          <div className="mx-auto max-w-[1600px] px-6 pb-3">
            <NavTabs links={navLinks} />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <AccessGuard allowedHrefs={allowedHrefs} />
        {children}
      </main>
    </div>
  );
}
