import { createClient } from "@/lib/supabase/server";
import InvoicesList from "./InvoicesList";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const [{ data: invoices, error }, { data: payments }] = await Promise.all([
    supabase.from("invoices").select("*, customers(name), projects(quote_number, lot_no, address, suburb)").order("invoice_number", { ascending: false }),
    supabase.from("invoice_payments").select("id, invoice_id, paid_on, amount, method, reference"),
  ]);
  return <InvoicesList invoices={(invoices ?? []) as any} payments={(payments ?? []) as any} setupError={error?.message ?? null} />;
}
