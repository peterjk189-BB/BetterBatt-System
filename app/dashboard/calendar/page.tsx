import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole, getEffectiveSubcontractorId } from "@/lib/currentUser";
import CalendarView from "./CalendarView";

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

  const [{ data: woLines }, { data: pos }, { data: visits }] = await Promise.all([
    supabase.from("work_order_lines").select(WO_LINE_SELECT).not("task_date", "is", null).order("task_date"),
    supabase
      .from("purchase_orders")
      .select("id, po_number, status, delivery_date, delivery_address, archived, suppliers(name)")
      .not("delivery_date", "is", null)
      .order("delivery_date"),
    supabase
      .from("site_visits")
      .select("id, visit_number, visit_date, visit_time, status, customer_name, address, suburb, archived")
      .eq("archived", false)
      .not("visit_date", "is", null),
  ]);

  return <CalendarView woLines={(woLines ?? []) as any} pos={(pos ?? []) as any} visits={(visits ?? []) as any} installerNote={null} />;
}
