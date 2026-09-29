import { createClient } from "@/lib/supabase/server";

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold">Welcome</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Your account doesn&apos;t have admin access yet. If you&apos;re expecting to see your
          jobs here, ask the office to check your account.
        </p>
      </div>
    );
  }

  const tiles = [
    { href: "/dashboard/customers", label: "Customers", desc: "Builders, retro fit and private customers" },
    { href: "/dashboard/suppliers", label: "Suppliers", desc: "Material suppliers" },
    { href: "/dashboard/labour-items", label: "Labour Items", desc: "Contractor pay rate schedule" },
    { href: "/dashboard/parts", label: "Inventory", desc: "Materials, pricing and stock on hand" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Phase 2 is in progress — master data screens are live; quoting, work orders and
        purchase orders are next.
      </p>
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
