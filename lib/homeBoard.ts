// Data for the office/admin home board: money strip, today's jobs, and things that need attention.
// Every query is tolerant: if one fails (missing column or migration) that part is just left out.

export type BoardData = {
  money: { owed: number; overdue: number; overdueCount: number; invoicedMonth: number; contractorDue: number; openQuotes: number; oldQuotes: number };
  today: { time: string; title: string; sub: string; status: string; tone: "g" | "y" | ""; href: string }[];
  attention: { tone: "r" | "y" | "b"; title: string; sub: string; href: string }[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const addDays = (d: string, n: number) => {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");
const one = (v: any) => (Array.isArray(v) ? v[0] : v);
const addr = (p: any) => [p?.address, p?.suburb].filter(Boolean).join(", ");
const list = (xs: string[], n = 3) => xs.slice(0, n).join(" · ") + (xs.length > n ? ` · +${xs.length - n} more` : "");

export async function loadHomeBoard(supabase: any, today: string, contractorDue: number): Promise<BoardData> {
  const month = today.slice(0, 7);
  const old = addDays(today, -30);

  const [invRes, payRes, projRes, woRes, linesToday, visitsRes, poRes, partsRes, woLinesRes] = await Promise.all([
    supabase.from("invoices").select("id, project_id, invoice_number, status, total, amount_ex_gst, invoice_date, due_date, customers(name)"),
    supabase.from("invoice_payments").select("invoice_id, amount"),
    supabase.from("projects").select("id, quote_number, outcome, archived, entry_date, customers(name)").eq("archived", false),
    supabase.from("work_orders").select("id, wo_number, contractor_id, completed_date, archived").eq("archived", false).is("completed_date", null),
    supabase
      .from("work_order_lines")
      .select("work_order_id, subcontractor_id, work_orders!inner(id, wo_number, archived, projects(address, suburb, customers(name)), subcontractors(name)), subcontractors(name)")
      .eq("task_date", today)
      .eq("work_orders.archived", false),
    supabase.from("site_visits").select("id, visit_number, visit_time, status, customer_name, address, suburb, customers(name)").eq("visit_date", today).eq("archived", false).in("status", ["Booked", "Visited"]),
    supabase.from("purchase_orders").select("id, po_number, status, delivery_date, delivery_time, archived, suppliers(name)").eq("delivery_date", today).eq("archived", false),
    supabase.from("parts").select("id, name, stock_on_hand, reorder_level, archived").eq("archived", false).not("reorder_level", "is", null),
    supabase.from("work_order_lines").select("work_order_id, subcontractor_id"),
  ]);

  const invoices: any[] = invRes.data ?? [];
  const paid = new Map<string, number>();
  for (const p of (payRes.data ?? []) as any[]) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + (Number(p.amount) || 0));
  const issued = invoices.filter((i) => i.status !== "Draft" && i.status !== "Void");
  const owing = issued.map((i) => ({ i, owe: r2((Number(i.total) || 0) - (paid.get(i.id) ?? 0)) })).filter((r) => r.owe > 0.005);
  const overdueRows = owing.filter((r) => r.i.due_date && r.i.due_date < today);
  const projects: any[] = projRes.data ?? [];
  const openQ = projects.filter((p) => p.outcome === "Open");
  const oldQ = openQ.filter((p) => p.entry_date && p.entry_date < old);

  const money = {
    owed: owing.reduce((s, r) => s + r.owe, 0),
    overdue: overdueRows.reduce((s, r) => s + r.owe, 0),
    overdueCount: overdueRows.length,
    invoicedMonth: issued.filter((i) => (i.invoice_date || "").startsWith(month)).reduce((s, i) => s + (Number(i.amount_ex_gst) || 0), 0),
    contractorDue,
    openQuotes: openQ.length,
    oldQuotes: oldQ.length,
  };

  // ---- today ----------------------------------------------------------------------
  const todayItems: (BoardData["today"][number] & { sort: string })[] = [];
  const seen = new Set<string>();
  for (const l of (linesToday.data ?? []) as any[]) {
    const wo = one(l.work_orders);
    if (!wo || seen.has(wo.id)) continue;
    seen.add(wo.id);
    const pr = one(wo.projects);
    const sub = one(l.subcontractors)?.name || one(wo.subcontractors)?.name || "No contractor yet";
    todayItems.push({ sort: "5", time: "Job", title: `${wo.wo_number} · ${one(pr?.customers)?.name ?? ""}`.replace(/ · $/, ""), sub: `${addr(pr) || "No address"} · ${sub}`, status: "Booked", tone: "g", href: `/dashboard/work-orders/${wo.id}` });
  }
  for (const v of (visitsRes.data ?? []) as any[]) {
    const t = hhmm(v.visit_time);
    todayItems.push({ sort: t || "9", time: t || "Visit", title: `Site visit · ${v.customer_name || one(v.customers)?.name || "Customer"}`, sub: addr(v) || "No address", status: v.status, tone: "", href: `/dashboard/site-visits/${v.id}` });
  }
  for (const p of (poRes.data ?? []) as any[]) {
    if (p.status === "Received") continue;
    const t = hhmm(p.delivery_time);
    todayItems.push({ sort: t || "9", time: t || "All day", title: `Delivery · ${one(p.suppliers)?.name || "Supplier"}`, sub: `PO ${p.po_number}`, status: "Receive", tone: "y", href: `/dashboard/purchase-orders/${p.id}` });
  }
  // Start times for today's work order lines (newer column; fine if missing).
  const woIds = Array.from(seen);
  if (woIds.length) {
    const { data: tl, error } = await supabase.from("work_order_lines").select("work_order_id, task_time").eq("task_date", today).in("work_order_id", woIds);
    if (!error) {
      const first = new Map<string, string>();
      for (const r of (tl ?? []) as any[]) if (r.task_time && (!first.has(r.work_order_id) || r.task_time < first.get(r.work_order_id)!)) first.set(r.work_order_id, r.task_time);
      for (const it of todayItems) {
        const id = it.href.startsWith("/dashboard/work-orders/") ? it.href.split("/").pop()! : "";
        const t = first.get(id);
        if (t) { it.time = hhmm(t); it.sort = hhmm(t); }
      }
    }
  }
  todayItems.sort((a, b) => a.sort.localeCompare(b.sort));

  // ---- needs attention ------------------------------------------------------------
  const attention: BoardData["attention"] = [];
  if (overdueRows.length) {
    attention.push({
      tone: "r",
      title: `${overdueRows.length} invoice${overdueRows.length === 1 ? "" : "s"} overdue`,
      sub: list(overdueRows.sort((a, b) => b.owe - a.owe).map((r) => `${one(r.i.customers)?.name ?? "Customer"} $${Math.round(r.owe).toLocaleString("en-AU")}`)),
      href: "/dashboard/invoices",
    });
  }
  const withInvoice = new Set(invoices.filter((i) => i.status !== "Void" && i.project_id).map((i) => i.project_id));
  const noInv = projects.filter((p) => (p.outcome === "Accepted" || p.outcome === "Complete") && !withInvoice.has(p.id));
  if (noInv.length) {
    attention.push({ tone: "y", title: `${noInv.length} accepted quote${noInv.length === 1 ? "" : "s"} with no invoice`, sub: list(noInv.map((p) => `Q${p.quote_number} ${one(p.customers)?.name ?? ""}`.trim())), href: "/dashboard/quotes" });
  }
  const drafts = invoices.filter((i) => i.status === "Draft");
  if (drafts.length) {
    attention.push({ tone: "y", title: `${drafts.length} draft invoice${drafts.length === 1 ? "" : "s"} not sent`, sub: list(drafts.map((i) => `INV-${i.invoice_number}`)), href: "/dashboard/invoices" });
  }
  const contractorByWo = new Set<string>();
  for (const l of (woLinesRes.data ?? []) as any[]) if (l.subcontractor_id) contractorByWo.add(l.work_order_id);
  const noContractor = ((woRes.data ?? []) as any[]).filter((w) => !w.contractor_id && !contractorByWo.has(w.id));
  if (noContractor.length) {
    attention.push({ tone: "y", title: `${noContractor.length} work order${noContractor.length === 1 ? "" : "s"} with no contractor`, sub: list(noContractor.map((w) => w.wo_number)), href: "/dashboard/work-orders" });
  }
  const low = ((partsRes.data ?? []) as any[]).filter((p) => Number(p.reorder_level) > 0 && (Number(p.stock_on_hand) || 0) < Number(p.reorder_level));
  if (low.length) {
    attention.push({ tone: "b", title: `${low.length} product${low.length === 1 ? "" : "s"} below reorder level`, sub: "See the Low stock report", href: "/dashboard/reports" });
  }
  if (oldQ.length) {
    attention.push({ tone: "b", title: `${oldQ.length} quote${oldQ.length === 1 ? "" : "s"} open over 30 days`, sub: "Mark Lost or chase", href: "/dashboard/quotes" });
  }

  return { money, today: todayItems.map(({ sort, ...x }) => x), attention };
}
