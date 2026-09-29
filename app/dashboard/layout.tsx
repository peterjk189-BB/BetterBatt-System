import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

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
    { href: "/dashboard/customers", label: "Customers" },
    { href: "/dashboard/suppliers", label: "Suppliers" },
    { href: "/dashboard/labour-items", label: "Labour Items" },
    { href: "/dashboard/parts", label: "Inventory" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-bold">
              Coverage
            </Link>
            {isAdmin && (
              <nav className="flex gap-4 text-sm text-[var(--muted)]">
                {adminLinks.map((l) => (
                  <Link key={l.href} href={l.href} className="hover:text-[var(--text)]">
                    {l.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <span>
              {profile?.full_name || user.email}
              {isAdmin ? " (admin)" : " (installer)"}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
