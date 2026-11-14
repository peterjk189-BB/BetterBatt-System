import { lineRate } from "@/lib/woRate";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { ALL_TABS, GROUP_ACCENTS } from "@/lib/tabs";
import { resolveTabsForRequest } from "@/lib/preview";
import HomeTiles from "./HomeTiles";
import HomeBoard from "./HomeBoard";
import { loadHomeBoard } from "@/lib/homeBoard";
import { parseLayout } from "@/lib/homeLayout";
import { getInstallerScope } from "@/lib/installerScope";

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

// Brand accent colors sampled from public/logo.png, cycled across the KPI tiles.
const KPI_ACCENTS = ["#fdb930", "#b1841f", "#5f6062", "#2563eb"];

// Soft icon-tile colours per nav group: [background, icon colour]
const ICON_TILE: Record<string, [string, string]> = {
  Sales: ["#fff3d1", "#a87500"],
  Operations: ["#f4ead2", "#b1841f"],
  Insights: ["#dbe7fd", "#2563eb"],
  Admin: ["#e8e8e6", "#5f6062"],
};

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, allowed_tabs, full_name")
    .eq("id", user!.id)
    .single();

  const { tabs: myTabs, previewing } = await resolveTabsForRequest(profile?.role, profile?.allowed_tabs ?? null, user!.id);
  const tiles = ALL_TABS.filter(
    (t) => myTabs.includes(t.key) && t.key !== "users" && t.key !== "audit-log" && t.key !== "settings"
  );

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

  // Office/admin can arrange their tiles (needs migration 0095; falls back to the default order if the column is missing).
  const canArrange = (profile?.role === "admin" || profile?.role === "office") && !previewing;
  const { data: layRow, error: layErr } = canArrange
    ? await supabase.from("profiles").select("home_layout").eq("id", user!.id).single()
    : { data: null, error: null as any };
  const layout = parseLayout(layErr ? null : (layRow as any)?.home_layout);

  const showQuotesKpi = myTabs.includes("quotes");
  const showWorkOrdersKpi = myTabs.includes("work-orders");
  const showPurchaseOrdersKpi = myTabs.includes("purchase-orders");
  const showContractorPaymentsKpi = myTabs.includes("contractor-payments");

  // A contractor (or "Preview as" one) only counts their own authorised, non-archived jobs.
  const scope = await getInstallerScope(supabase);
  const [openQuotesRes, activeWorkOrdersRes, posAwaitingRes, unpaidLinesRes] = await Promise.all([
    showQuotesKpi
      ? supabase.from("projects").select("id", { count: "exact", head: true }).eq("archived", false).eq("outcome", "Open")
      : Promise.resolve({ count: 0 } as { count: number | null }),
    showWorkOrdersKpi
      ? scope
        ? scope.woIds.length
          ? supabase
              .from("work_orders")
              .select("id", { count: "exact", head: true })
              .in("id", scope.woIds)
              .is("completed_date", null)
          : Promise.resolve({ count: 0 } as { count: number | null })
        : supabase
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
      ? (() => {
          let q = supabase
            .from("work_order_lines")
            .select("*, labour_items(contractor_rate), parts(installer_rate_per_m2), work_orders!inner(archived)")
            .eq("paid", false)
            .eq("work_orders.archived", false);
          if (scope) q = scope.subId ? q.eq("subcontractor_id", scope.subId) : q.in("work_order_id", []);
          return q;
        })()
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const contractorPaymentsDue = ((unpaidLinesRes as any).data ?? []).reduce(
    (sum: number, l: any) =>
      sum + (Number(l.qty) || 0) * lineRate(l.rate, l.labour_items?.contractor_rate, l.parts?.installer_rate_per_m2),
    0
  );

  // My follow-ups: CRM tasks assigned to me (never other people's) that are due today or overdue.
  let myTasks: { id: string; title: string; due_date: string; lead_id: string | null; customer_id: string | null }[] = [];
  const todayMelb = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  if (myTabs.includes("crm")) {
    const { data } = await supabase
      .from("crm_tasks")
      .select("id, title, due_date, lead_id, customer_id")
      .eq("assigned_to", user!.id)
      .eq("done", false)
      .lte("due_date", todayMelb)
      .order("due_date")
      .limit(8);
    myTasks = (data ?? []) as typeof myTasks;
  }

  // Office and admin get a "what needs doing" board; the big tab tiles stay for phones only.
  if (canArrange) {
    const board = await loadHomeBoard(supabase, todayMelb, contractorPaymentsDue);
    const hour = Number(new Date().toLocaleString("en-AU", { hour: "numeric", hour12: false, timeZone: "Australia/Melbourne" }));
    const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const first = ((profile as any)?.full_name || "").split(" ")[0];
    const todayLabel = new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Melbourne" });
    const actions = [
      myTabs.includes("quotes") && { label: "+ New quote", href: "/dashboard/quotes/new", primary: true },
      myTabs.includes("invoices") && { label: "+ New invoice", href: "/dashboard/invoices/new", primary: true },
      myTabs.includes("site-visits") && { label: "Log site visit", href: "/dashboard/site-visits/new" },
      myTabs.includes("purchase-orders") && { label: "New purchase order", href: "/dashboard/purchase-orders/new" },
      myTabs.includes("calculator") && { label: "Pack calculator", href: "/dashboard/calculator" },
    ].filter(Boolean) as { label: string; href: string; primary?: boolean }[];
    const followups = myTasks.map((t) => ({
      id: t.id,
      title: t.title,
      overdue: t.due_date < todayMelb,
      href: t.lead_id ? `/dashboard/crm/leads/${t.lead_id}` : t.customer_id ? `/dashboard/crm/accounts/${t.customer_id}` : "/dashboard/crm?tab=tasks",
    }));
    return (
      <div>
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Better Batt Insulation" width={140} height={70} className="h-10 w-auto" priority />
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <HomeBoard
          data={board}
          actions={actions}
          followups={followups}
          layout={layout}
          todayLabel={todayLabel}
          name={`${greet}${first ? `, ${first}` : ""}`}
          showFollowups={myTabs.includes("crm")}
        />
        <div className="mt-8 sm:hidden">
          <HomeTiles tiles={tiles.map((t) => ({ key: t.key, href: t.href, label: t.label, desc: t.desc, group: t.group }))} layout={layout} canArrange={false} />
        </div>
      </div>
    );
  }

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
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="Better Batt Insulation" width={140} height={70} className="h-10 w-auto" priority />
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {kpis.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <a
              key={k.href}
              href={k.href}
              style={{ borderTopColor: KPI_ACCENTS[i % KPI_ACCENTS.length] }}
              className="rounded-xl border border-t-4 border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-colors hover:border-[var(--border)]"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{k.label}</p>
              <p className="mt-1 text-2xl font-bold">{k.value}</p>
            </a>
          ))}
        </div>
      )}

      <HomeTiles
        tiles={tiles.map((t) => ({ key: t.key, href: t.href, label: t.label, desc: t.desc, group: t.group }))}
        layout={layout}
        canArrange={canArrange}
      />

      {myTabs.includes("crm") && myTasks.length > 0 && (
        <div className="mt-8 rounded-xl border border-[var(--border)] border-t-4 border-t-[#fdb930] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">My follow-ups due</p>
            <a href="/dashboard/crm?tab=tasks" className="text-sm text-accent hover:underline">
              Open tasks
            </a>
          </div>
          <div className="mt-2 divide-y divide-[var(--border)]">
            {myTasks.map((t) => (
              <a
                key={t.id}
                href={t.lead_id ? `/dashboard/crm/leads/${t.lead_id}` : t.customer_id ? `/dashboard/crm/accounts/${t.customer_id}` : "/dashboard/crm?tab=tasks"}
                className="flex items-center justify-between gap-3 py-2 text-sm hover:underline"
              >
                <span className="min-w-0 truncate font-medium">{t.title}</span>
                <span className={`shrink-0 text-xs font-medium ${t.due_date < todayMelb ? "text-[#b91c1c]" : "text-[var(--muted)]"}`}>
                  {t.due_date < todayMelb ? "Overdue" : "Today"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
