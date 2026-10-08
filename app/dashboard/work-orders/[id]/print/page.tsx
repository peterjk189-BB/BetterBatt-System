import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import WorkOrderPrintView from "./WorkOrderPrintView";

export default async function WorkOrderPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { contractor_id?: string };
}) {
  const supabase = await createClient();
  const [{ data: workOrder }, { data: lines }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, wo_number, po_number, po_value, entry_date, completed_date, jsa_received, notes, contractor_id, projects(quote_number, lot_no, address, suburb, customers(name)), subcontractors(id, name, phone, email)"
      )
      .eq("id", params.id)
      .single(),
    supabase
      .from("work_order_lines")
      .select(
        "task_date, qty, note, subcontractor_id, parts(name), labour_items(code, description, contractor_rate), subcontractors(id, name, phone, email)"
      )
      .eq("work_order_id", params.id)
      .order("sort_order"),
  ]);

  if (!workOrder) notFound();

  const allLines = (lines ?? []) as any[];

  // Work out which contractor each line effectively belongs to (its own override,
  // or the work order's header contractor when it doesn't have one), and the
  // distinct set of contractors actually involved.
  const effectiveContractor = (l: any) => l.subcontractors || workOrder.subcontractors;
  const contractorMap = new Map<string, { id: string; name: string; phone: string | null; email: string | null }>();
  for (const l of allLines) {
    const c = effectiveContractor(l);
    if (c?.id) contractorMap.set(c.id, c);
  }
  const distinctContractors = Array.from(contractorMap.values());

  // More than one contractor on this work order: each one needs their own
  // separate printed/PDF document, so require picking which one first rather
  // than mixing their lines together on one page.
  if (distinctContractors.length > 1 && !searchParams.contractor_id) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-bold">Choose a contractor</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This work order has lines split across more than one contractor. Pick which contractor's work order you
          want to print or download — each gets their own separate document.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {distinctContractors.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/work-orders/${params.id}/print?contractor_id=${c.id}`}
              className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-medium hover:border-accent"
            >
              {c.name}
            </Link>
          ))}
        </div>
        <Link
          href={`/dashboard/work-orders/${params.id}`}
          className="mt-4 inline-block text-sm text-[var(--muted)] hover:underline"
        >
          &larr; Back to work order
        </Link>
      </div>
    );
  }

  const activeContractorId = searchParams.contractor_id || distinctContractors[0]?.id || workOrder.contractor_id;
  const activeContractor = activeContractorId ? contractorMap.get(activeContractorId) : workOrder.subcontractors;

  const linesForContractor = allLines.filter((l) => effectiveContractor(l)?.id === activeContractorId);

  const workOrderForView = { ...workOrder, subcontractors: activeContractor || workOrder.subcontractors };

  return <WorkOrderPrintView workOrder={workOrderForView as any} lines={linesForContractor as any} />;
}
