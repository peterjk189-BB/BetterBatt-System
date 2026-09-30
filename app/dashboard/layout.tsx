import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import NavTabs from "./NavTabs";

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
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  const adminLinks = [
    { href: "/dashboard/quotes", label: "Quotes" },
    { href: "/dashboard/work-orders", label: "Work Orders" },
    { href: "/dashboard/purchase-orders", label: "Purchase Orders" },
    { href: "/dashboard/customers", label: "Customers" },
    { href: "/dashboard/suppliers", label: "Suppliers" },
    { href: "/dashboard/subcontractors", label: "Subcontractors" },
    { href: "/dashboard/labour-items", label: "Labour Items" },
    { href: "/dashboard/parts", label: "Inventory" },
  ];

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
              {isAdmin ? " (admin)" : " (installer)"}
            </span>
            <SignOutButton />
          </div>
        </div>
        {isAdmin && (
          <div className="mx-auto max-w-[1600px] px-6 pb-3">
            <NavTabs links={adminLinks} />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-8">{children}</main>
    </div>
  );
}
