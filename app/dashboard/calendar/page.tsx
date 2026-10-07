import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole, getEffectiveSubcontractorId } from "@/lib/currentUser";
import CalendarView from "./CalendarView";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookDueInspections } from "@/lib/inspectionPrefill";

const WO_LINE_SELECT =
  "id, task_date, note, qty, work_order_id, subcontractor_id, work_orders(wo_number, archived, contractor_id, projects(quote_number, address, suburb, customers(name)), subcontractors(name)), subcontractors(name), labour_items(code, description)";

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

    const { data: woLines } = subId
      ? await supabase.from("work_order_lines").select(WO_LINE_SELECT).eq("subcontractor_id", subId).not("task_date", "is", null).order("task_date")
      : { data: [] };

    return (
      <CalendarView
        woLines={(woLines ?? []) as any}
        pos={[]}
        visits={[]}
        installerNote={
          sampleName
            ? `Sample view — showing ${sampleName}'s scheduled jobs as an example. A real installer only ever sees their own jobs here, nothing else.`
            : "Showing your scheduled jobs only."
        }
      />
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

  const [{ data: woLines }, { data: pos }, { data: visits }, { data: inspections }] = await Promise.all([
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
  ]);

  return (
    <CalendarView
      woLines={(woLines ?? []) as any}
      pos={(pos ?? []) as any}
      visits={(visits ?? []) as any}
      inspections={(inspections ?? []) as any}
      crmTasks={crmTasks as any}
      bookingErrors={bookingErrors}
      installerNote={null}
    />
  );
}
