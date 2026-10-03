import { createClient } from "@/lib/supabase/server";
import { ALL_TABS } from "@/lib/tabs";
import { resolveTabsForRequest } from "@/lib/preview";

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

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

  const showQuotesKpi = myTabs.includes("quotes");
  const showWorkOrdersKpi = myTabs.includes("work-orders");
  const showPurchaseOrdersKpi = myTabs.includes("purchase-orders");
  const showContractorPaymentsKpi = myTabs.includes("contractor-payments");

  const [openQuotesRes, activeWorkOrdersRes, posAwaitingRes, unpaidLinesRes] = await Promise.all([
    showQuotesKpi
      ? supabase.from("projects").select("id", { count: "exact", head: true }).eq("archived", false).eq("outcome", "Open")
      : Promise.resolve({ count: 0 } as { count: number | null }),
    showWorkOrdersKpi
      ? supabase
          .from("work_orders")
          .select("id", { count: "exact", head: true })
          .eq("archived", false)
          .is("completed_date", null)
      : Promise.resolve({ count: 0 } as { count: number | null }),
    showPurchaseOrdersKpi
      ? supabase
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .eq("archived", false)
          .neq("status", "Received")
      : Promise.resolve({ count: 0 } as { count: number | null }),
    showContractorPaymentsKpi
      ? supabase
          .from("work_order_lines")
          .select("qty, paid, labour_items(contractor_rate), work_orders!inner(archived)")
          .eq("paid", false)
          .eq("work_orders.archived", false)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const contractorPaymentsDue = ((unpaidLinesRes as any).data ?? []).reduce(
    (sum: number, l: any) => sum + (Number(l.qty) || 0) * (l.labour_items?.contractor_rate || 0),
    0
  );

  const kpis: { label: string; value: string; href: string }[] = [];
  if (showQuotesKpi) {
    kpis.push({ label: "Open quotes", value: String(openQuotesRes.count ?? 0), href: "/dashboard/quotes" });
  }
  if (showWorkOrdersKpi) {
    kpis.push({ label: "Active work orders", value: String(activeWorkOrdersRes.count ?? 0), href: "/dashboard/work-orders" });
  }
  if (showPurchaseOrdersKpi) {
    kpis.push({ label: "POs awaiting delivery", value: String(posAwaitingRes.count ?? 0), href: "/dashboard/purchase-orders" });
  }
  if (showContractorPaymentsKpi) {
    kpis.push({
      label: "Contractor payments due",
      value: fmtCurrency(contractorPaymentsDue),
      href: "/dashboard/contractor-payments",
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {kpis.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <a
              key={k.href}
              href={k.href}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-accent"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{k.label}</p>
              <p className="mt-1 text-2xl font-bold">{k.value}</p>
            </a>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
