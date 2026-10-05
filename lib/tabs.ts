// Single source of truth for every tab/page in the dashboard, used by:
// - the sidebar nav (app/dashboard/Sidebar.tsx) and mobile nav bar (NavTabs.tsx)
// - the dashboard home tiles (app/dashboard/page.tsx)
// - the Users admin page's "tabs this user can see" checklist
// - the client-side access guard that redirects away from un-granted pages
//
// `adminOnly: true` means the tab is never offered in the checklist for a
// non-admin user, because the page itself hard-redirects anyone who isn't an
// admin (Users, Audit Log) regardless of what's ticked here.
//
// `group` is purely cosmetic — it decides which heading a tab sits under in
// the sidebar.
export const ALL_TABS = [
  { key: "calendar", href: "/dashboard/calendar", label: "Calendar", desc: "Work orders and PO deliveries by week", adminOnly: false, group: "Operations" },
  {
    key: "site-visits",
    href: "/dashboard/site-visits",
    label: "Site Visits",
    desc: "On-site checklist, measurements and photos before quoting",
    adminOnly: false,
    group: "Sales",
  },
  { key: "quotes", href: "/dashboard/quotes", label: "Quotes", desc: "Create and manage customer quotes", adminOnly: false, group: "Sales" },
  {
    key: "swms",
    href: "/dashboard/swms",
    label: "SWMS / JSA",
    desc: "Safe work method statement installers fill in on site before starting",
    adminOnly: false,
    group: "Operations",
  },
  {
    key: "inspections",
    href: "/dashboard/inspections",
    label: "Inspections",
    desc: "Foil, wall and ceiling inspection reports with photos",
    adminOnly: false,
    group: "Operations",
  },
  {
    key: "work-orders",
    href: "/dashboard/work-orders",
    label: "Work Orders",
    desc: "Contractor task lists and pay tracking",
    adminOnly: false,
    group: "Operations",
  },
  {
    key: "contractor-payments",
    href: "/dashboard/contractor-payments",
    label: "Contractor Payments",
    desc: "Track what's owed and paid to contractors",
    adminOnly: false,
    group: "Operations",
  },
  {
    key: "purchase-orders",
    href: "/dashboard/purchase-orders",
    label: "Purchase Orders",
    desc: "Orders placed with suppliers to restock inventory",
    adminOnly: false,
    group: "Operations",
  },
  {
    key: "customers",
    href: "/dashboard/customers",
    label: "Customers",
    desc: "Builders, retro fit and private customers",
    adminOnly: false,
    group: "Sales",
  },
  { key: "suppliers", href: "/dashboard/suppliers", label: "Suppliers", desc: "Material suppliers", adminOnly: false, group: "Operations" },
  {
    key: "subcontractors",
    href: "/dashboard/subcontractors",
    label: "Subcontractors",
    desc: "Installer contact details and rates",
    adminOnly: false,
    group: "Operations",
  },
  {
    key: "labour-items",
    href: "/dashboard/labour-items",
    label: "Labour Items",
    desc: "Contractor pay rate schedule",
    adminOnly: false,
    group: "Operations",
  },
  { key: "parts", href: "/dashboard/parts", label: "Inventory", desc: "Materials, pricing and stock on hand", adminOnly: false, group: "Operations" },
  {
    key: "reports",
    href: "/dashboard/reports",
    label: "Reports",
    desc: "Inventory, customer and supplier reports",
    adminOnly: false,
    group: "Insights",
  },
  { key: "users", href: "/dashboard/users", label: "Users", desc: "Invite and manage app users", adminOnly: true, group: "Admin" },
  { key: "audit-log", href: "/dashboard/audit-log", label: "Audit Log", desc: "Sign-ins and record changes", adminOnly: true, group: "Admin" },
  {
    key: "settings",
    href: "/dashboard/settings",
    label: "Settings",
    desc: "Quote terms & conditions and other company settings",
    adminOnly: true,
    group: "Admin",
  },
] as const;

export type TabKey = (typeof ALL_TABS)[number]["key"];

/** Brand accent color per nav group, sampled from public/logo.png, shared by the sidebar and the dashboard home tiles. */
export const GROUP_ACCENTS: Record<string, string> = {
  Sales: "#fdb930",
  Operations: "#b1841f",
  Insights: "#2563eb",
  Admin: "#5f6062",
};

/** Readable text color to pair with each GROUP_ACCENTS background (the bright gold needs dark text). */
export const GROUP_ACCENT_TEXT: Record<string, string> = {
  Sales: "#201f1c",
  Operations: "#ffffff",
  Insights: "#ffffff",
  Admin: "#ffffff",
};

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
