import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole, getEffectiveSubcontractorId } from "@/lib/currentUser";
import { getInstallerScope } from "@/lib/installerScope";
import CalendarView from "./CalendarView";
import TodaysJobs from "./TodaysJobs";
import LiveRefresh from "./LiveRefresh";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookDueInspections } from "@/lib/inspectionPrefill";

const WO_LINE_SELECT =
  "id, task_date, note, qty, completed, work_order_id, subcontractor_id, work_orders(wo_number, archived, completed_date, contractor_id, projects(quote_number, address, suburb, customers(name)), subcontractors(name)), subcontractors(name), labour_items(code, description), parts(name, is_stock_item)";

// Start times live in a newer column; fetched separately so the calendar still loads if migration 0039 hasn't been run.
async function withTimes(supabase: Awaited<ReturnType<typeof createClient>>, lines: any[] | null) {
  const list = lines ?? [];
  if (list.length === 0) return list;
  const { data, error } = await supabase.from("work_order_lines").select("id, task_time").not("task_time", "is", null);
  if (error || !data) return list;
  const t = new Map((data as any[]).map((r) => [r.id, r.task_time as string]));
  return list.map((l) => ({ ...l, task_time: t.get(l.id) ?? null }));
}

export default async function CalendarPage() {
  const supabase = await createClient();
  const role = await getEffectiveRole();

  // Installers (real accounts, and the no-login sample installer preview)
  // only ever see their own scheduled work — no other installers' jobs, no
  // PO deliveries, no site visits.
  if (role === "installer") {
    let subId = await getEffectiveSubcontractorId();
    let sampleName: string | null = null;

    if (!subId) {
      // The sample preview isn't tied to a real installer, so there's
      // nothing to scope to by default. Pick whichever subcontractor has
      // the next upcoming job as an illustrative example, so the preview
      // still demonstrates "own jobs only" instead of showing nothing.
      const { data: upcoming } = await supabase
        .from("work_order_lines")
        .select("subcontractor_id, subcontractors(name)")
        .not("task_date", "is", null)
        .not("subcontractor_id", "is", null)
        .order("task_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      subId = upcoming?.subcontractor_id ?? null;
      sampleName = (upcoming as any)?.subcontractors?.name ?? null;
    }

    // Only authorised, non-archived jobs reach a contractor (mirrors the database rule, so "Preview as" matches too).
    const scope = await getInstallerScope(supabase);
    const { data: woLines } = subId
      ? await supabase.from("work_order_lines").select(WO_LINE_SELECT).eq("subcontractor_id", subId).not("task_date", "is", null).order("task_date")
      : { data: [] };

    // Today's jobs (Melbourne time) get a "Start SWMS" button at the top of the schedule.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
    const todayLines = ((woLines ?? []) as any[]).filter((l) => l.task_date === today && l.work_orders && !l.work_orders.archived && (!scope || scope.woIds.includes(l.work_order_id)));
    const woIds = Array.from(new Set(todayLines.map((l) => l.work_order_id as string)));
    const { data: swmsRows } = woIds.length
      ? await supabase.from("swms").select("id, status, work_order_id, job_date").in("work_order_id", woIds).eq("archived", false).order("created_at", { ascending: false })
      : { data: [] as any[] };
    const todaysJobs = woIds.map((id) => {
      const l = todayLines.find((x) => x.work_order_id === id);
      const proj = l?.work_orders?.projects;
      const sw = (swmsRows ?? []).find((r: any) => r.work_order_id === id && r.job_date === today) || null;
      return {
        workOrderId: id,
        woNumber: String(l?.work_orders?.wo_number ?? ""),
        site: [proj?.address, proj?.suburb].filter(Boolean).join(", "),
        customer: proj?.customers?.name ?? "",
        swms: sw ? { id: sw.id as string, status: sw.status as string } : null,
      };
    });

    return (
      <>
      <LiveRefresh />
      <TodaysJobs jobs={todaysJobs} />
      <CalendarView
        woLines={(await withTimes(supabase, ((woLines ?? []) as any[]).filter((l) => l.work_orders && !l.work_orders.archived && (!scope || scope.woIds.includes(l.work_order_id))) as any)) as any}
        pos={[]}
        visits={[]}
        installerNote={
          sampleName
            ? `Sample view — showing ${sampleName}'s scheduled jobs as an example. A real installer only ever sees their own jobs here, nothing else.`
            : "Showing your scheduled jobs only."
        }
      />
      </>
    );
  }

  // Book any inspection that's due but not on the calendar yet (SWMS completed, no inspection).
  let bookingErrors: string[] = [];
  try {
    bookingErrors = (await bookDueInspections(createAdminClient())).errors;
  } catch (e: any) {
    bookingErrors = [e?.message || "Couldn't check for inspections to book"];
  }

  // Office / admin users also see their own open CRM follow-ups on the calendar.
  let crmTasks: any[] = [];
  if (role === "admin" || role === "office") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("crm_tasks")
        .select("id, title, kind, due_date, lead_id, customer_id, leads:crm_leads(name), customers(name)")
        .eq("assigned_to", user.id)
        .eq("done", false);
      crmTasks = data ?? [];
    }
  }

  // Time away (holidays, appointments) and the people it can be booked for. The table exists after migration 0064.
  let timeAway: any[] = [];
  let awayPeople: { key: string; name: string; group: string }[] = [];
  if (role === "admin" || role === "office") {
    const [taRes, staffRes, subRes] = await Promise.all([
      supabase.from("time_away").select("*").order("start_date"),
      supabase.from("profiles").select("id, full_name, role").in("role", ["admin", "office"]).order("full_name"),
      supabase.from("subcontractors").select("id, name").eq("archived", false).order("name"),
    ]);
    timeAway = taRes.error ? [] : taRes.data ?? [];
    awayPeople = [
      ...((staffRes.data ?? []) as any[]).map((u) => ({ key: `u:${u.id}`, name: u.full_name || "Unnamed user", group: "Office" })),
      ...((subRes.data ?? []) as any[]).map((c) => ({ key: `s:${c.id}`, name: c.name, group: "Contractors" })),
    ];
  }

  const [{ data: woLines }, { data: pos }, { data: visits }, { data: inspections }, { data: stockDeliveries }, invoiceDeliveries] = await Promise.all([
    supabase.from("work_order_lines").select(WO_LINE_SELECT).not("task_date", "is", null).order("task_date"),
    supabase
      .from("purchase_orders")
      .select("id, po_number, status, delivery_date, delivery_address, archived, suppliers(name)")
      .not("delivery_date", "is", null)
      .order("delivery_date"),
    supabase
      .from("site_visits")
      .select("id, visit_number, visit_date, visit_time, status, customer_name, address, suburb, archived, assigned_to, profiles(full_name)")
      .eq("archived", false)
      .not("visit_date", "is", null),
    supabase
      .from("inspections")
      .select("id, inspection_number, inspection_date, inspection_time, status, result, site_address, suburb, builder_name, installer_name, parent_inspection_id, archived, work_orders(wo_number)")
      .eq("archived", false),
    // Stock to be delivered for a work order (set on its picking slip).
    supabase
      .from("work_orders")
      .select("id, wo_number, stock_delivery_date, projects(lot_no, address, suburb, customers(name)), work_order_lines(parts(is_stock_item, suppliers(name)))")
      .eq("archived", false)
      .not("stock_delivery_date", "is", null),
    // Delivery / pick-up dates set on item invoices (columns come from migration 0053; empty until it has been run).
    supabase
      .from("invoices")
      .select("id, invoice_number, status, delivery_method, delivery_date, delivery_address, site_address, customers(name)")
      .neq("status", "Void")
      .not("delivery_date", "is", null)
      .then((r) => (r.error ? [] : r.data ?? [])),
  ]);

  return (
    <>
    <LiveRefresh />
    <CalendarView
      woLines={(await withTimes(supabase, woLines as any)) as any}
      pos={(pos ?? []) as any}
      visits={(visits ?? []) as any}
      inspections={(inspections ?? []) as any}
      crmTasks={crmTasks as any}
      stockDeliveries={(stockDeliveries ?? []) as any}
      invoiceDeliveries={invoiceDeliveries as any}
      bookingErrors={bookingErrors}
      timeAway={timeAway as any}
      awayPeople={awayPeople}
      installerNote={null}
    />
    </>
  );
}
