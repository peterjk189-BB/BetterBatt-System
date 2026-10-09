import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceEditor from "./InvoiceEditor";

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, customers(name, contact_email), projects(id, quote_number, lot_no, address, suburb, contact_email)")
      .eq("id", params.id)
      .single(),
    supabase.from("invoice_payments").select("*").eq("invoice_id", params.id).order("paid_on"),
  ]);
  if (!invoice) notFound();
  return <InvoiceEditor invoice={invoice as any} payments={(payments ?? []) as any} />;
}
