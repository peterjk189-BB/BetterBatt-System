import { invNo } from "@/lib/invoices";

export type InvoiceNote = { number: string; notes: string };

/** Notes typed on the tax invoice(s) for this work order's job (voided invoices ignored), for the picking slip. */
export async function invoiceNotesForWo(supabase: any, workOrderId: string): Promise<InvoiceNote[]> {
  const { data: wo } = await supabase.from("work_orders").select("project_id").eq("id", workOrderId).single();
  if (!wo?.project_id) return [];
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number, notes, status")
    .eq("project_id", wo.project_id)
    .order("invoice_number");
  return ((data ?? []) as any[])
    .filter((i) => i.status !== "Void" && (i.notes || "").trim())
    .map((i) => ({ number: invNo(i.invoice_number), notes: String(i.notes).trim() }));
}
