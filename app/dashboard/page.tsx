import { createClient } from "@/lib/supabase/server";
import { ALL_TABS } from "@/lib/tabs";
import { resolveTabsForRequest } from "@/lib/preview";

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, allowed_tabs")
    .eq("id", user!.id)
    .single();

  const { tabs: myTabs } = await resolveTabsForRequest(profile?.role, profile?.allowed_tabs ?? null, user!.id);
  const tiles = ALL_TABS.filter((t) => myTabs.includes(t.key) && t.key !== "users" && t.key !== "audit-log");

  if (tiles.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Welcome</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Your account doesn&apos;t have access to any pages yet. If you&apos;re expecting to see
          something here, ask the office to check your account.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <a
            key={t.href}
            href={t.href}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-accent"
          >
            <p className="font-semibold">{t.label}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{t.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
