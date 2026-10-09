import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceEditor from "./InvoiceEditor";

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: invoice }, { data: payments }, { data: lines }, { data: parts }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, customers(name, contact_email), projects(id, quote_number, lot_no, address, suburb, contact_email)")
      .eq("id", params.id)
      .single(),
    supabase.from("invoice_payments").select("*").eq("invoice_id", params.id).order("paid_on"),
    supabase.from("invoice_lines").select("*").eq("invoice_id", params.id).order("sort_order"),
    supabase
      .from("parts")
      .select("id, code, name, supply_charge_per_pack, price_retail, price_trade, price_regency")
      .eq("archived", false)
      .order("name"),
  ]);
  if (!invoice) notFound();
  return <InvoiceEditor invoice={invoice as any} payments={(payments ?? []) as any} initialLines={(lines ?? []) as any} parts={(parts ?? []) as any} />;
}
