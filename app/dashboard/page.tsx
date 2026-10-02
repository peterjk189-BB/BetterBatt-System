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

  if (profile?.role !== "admin" && profile?.role !== "office") {
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
    { href: "/dashboard/quotes", label: "Quotes", desc: "Create and manage customer quotes" },
    { href: "/dashboard/work-orders", label: "Work Orders", desc: "Contractor task lists and pay tracking" },
    { href: "/dashboard/purchase-orders", label: "Purchase Orders", desc: "Orders placed with suppliers to restock inventory" },
    { href: "/dashboard/customers", label: "Customers", desc: "Builders, retro fit and private customers" },
    { href: "/dashboard/suppliers", label: "Suppliers", desc: "Material suppliers" },
    { href: "/dashboard/subcontractors", label: "Subcontractors", desc: "Installer contact details and rates" },
    { href: "/dashboard/labour-items", label: "Labour Items", desc: "Contractor pay rate schedule" },
    { href: "/dashboard/parts", label: "Inventory", desc: "Materials, pricing and stock on hand" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Quotes, work orders and purchase orders are all live — Phase 3 (calendar, contractor
        pay reports, attachments) is next.
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
