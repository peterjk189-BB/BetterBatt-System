import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ALL_TABS } from "@/lib/tabs";
import { resolveTabsForRequest } from "@/lib/preview";
import SignOutButton from "./SignOutButton";
import NavTabs from "./NavTabs";
import AccessGuard from "./AccessGuard";
import PreviewBar from "./PreviewBar";

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
  const navLinks = ALL_TABS.filter((t) => myTabs.includes(t.key)).map((t) => ({ href: t.href, label: t.label }));
  const allowedHrefs = navLinks.map((l) => l.href);
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
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="font-bold">
            Better Batt System
          </Link>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            {isAdmin && <PreviewBar users={previewOptions} previewing={previewing} />}
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
