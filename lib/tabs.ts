// Single source of truth for every tab/page in the dashboard, used by:
// - the nav bar (app/dashboard/layout.tsx)
// - the dashboard home tiles (app/dashboard/page.tsx)
// - the Users admin page's "tabs this user can see" checklist
// - the client-side access guard that redirects away from un-granted pages
//
// `adminOnly: true` means the tab is never offered in the checklist for a
// non-admin user, because the page itself hard-redirects anyone who isn't an
// admin (Users, Audit Log) regardless of what's ticked here.
export const ALL_TABS = [
  { key: "calendar", href: "/dashboard/calendar", label: "Calendar", desc: "Work orders and PO deliveries by week", adminOnly: false },
  { key: "quotes", href: "/dashboard/quotes", label: "Quotes", desc: "Create and manage customer quotes", adminOnly: false },
  {
    key: "work-orders",
    href: "/dashboard/work-orders",
    label: "Work Orders",
    desc: "Contractor task lists and pay tracking",
    adminOnly: false,
  },
  {
    key: "contractor-payments",
    href: "/dashboard/contractor-payments",
    label: "Contractor Payments",
    desc: "Track what's owed and paid to contractors",
    adminOnly: false,
  },
  {
    key: "purchase-orders",
    href: "/dashboard/purchase-orders",
    label: "Purchase Orders",
    desc: "Orders placed with suppliers to restock inventory",
    adminOnly: false,
  },
  {
    key: "customers",
    href: "/dashboard/customers",
    label: "Customers",
    desc: "Builders, retro fit and private customers",
    adminOnly: false,
  },
  { key: "suppliers", href: "/dashboard/suppliers", label: "Suppliers", desc: "Material suppliers", adminOnly: false },
  {
    key: "subcontractors",
    href: "/dashboard/subcontractors",
    label: "Subcontractors",
    desc: "Installer contact details and rates",
    adminOnly: false,
  },
  {
    key: "labour-items",
    href: "/dashboard/labour-items",
    label: "Labour Items",
    desc: "Contractor pay rate schedule",
    adminOnly: false,
  },
  { key: "parts", href: "/dashboard/parts", label: "Inventory", desc: "Materials, pricing and stock on hand", adminOnly: false },
  {
    key: "reports",
    href: "/dashboard/reports",
    label: "Reports",
    desc: "Inventory, customer and supplier reports",
    adminOnly: false,
  },
  { key: "users", href: "/dashboard/users", label: "Users", desc: "Invite and manage app users", adminOnly: true },
  { key: "audit-log", href: "/dashboard/audit-log", label: "Audit Log", desc: "Sign-ins and record changes", adminOnly: true },
] as const;

export type TabKey = (typeof ALL_TABS)[number]["key"];

/** Tabs a user gets when they have no custom tab list saved (profiles.allowed_tabs is null). */
export function defaultTabsForRole(role: string | null | undefined): string[] {
  if (role === "admin") return ALL_TABS.map((t) => t.key);
  if (role === "office") return ALL_TABS.filter((t) => !t.adminOnly).map((t) => t.key);
  return []; // installer: no tabs unless explicitly granted
}

/** The tab list that actually applies for this profile right now. */
export function effectiveTabs(role: string | null | undefined, allowedTabs: string[] | null | undefined): string[] {
  if (allowedTabs && allowedTabs.length > 0) return allowedTabs;
  if (allowedTabs && allowedTabs.length === 0) return []; // explicitly granted nothing
  return defaultTabsForRole(role);
}
