import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceEditor from "./InvoiceEditor";

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: invoice }, { data: payments }, { data: lines }, { data: parts }, { data: suppliers }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, customers(*), projects(id, quote_number, lot_no, address, suburb, contact_email)")
      .eq("id", params.id)
      .single(),
    supabase.from("invoice_payments").select("*").eq("invoice_id", params.id).order("paid_on"),
    supabase.from("invoice_lines").select("*").eq("invoice_id", params.id).order("sort_order"),
    supabase
      .from("parts")
      .select("id, code, name, supply_charge_per_pack, price_retail, price_trade, price_regency, pack_cost_ex_gst, supplier_id")
      .eq("archived", false)
      .order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
  ]);
  if (!invoice) notFound();
  // Numbers of the purchase orders already raised from this invoice's lines (migration 0053 adds po_id).
  const poIds = Array.from(new Set(((lines ?? []) as any[]).map((l) => l.po_id).filter(Boolean)));
  const { data: poRows } = poIds.length ? await supabase.from("purchase_orders").select("id, po_number").in("id", poIds) : { data: [] as any[] };
  const poNumbers = Object.fromEntries(((poRows ?? []) as any[]).map((r) => [r.id, r.po_number || "PO"]));
  return (
    <InvoiceEditor
      invoice={invoice as any}
      payments={(payments ?? []) as any}
      initialLines={(lines ?? []) as any}
      parts={(parts ?? []) as any}
      suppliers={(suppliers ?? []) as any}
      initialPoNumbers={poNumbers}
    />
  );
}
