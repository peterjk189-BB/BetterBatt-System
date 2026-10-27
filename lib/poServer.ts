import { buildPoPdf } from "@/lib/poPdf";

type EmailContact = { label?: string; email?: string; po?: boolean };

/** Loads a purchase order, renders its PDF, and works out who it should be emailed to. */
export async function loadPoPdf(supabase: any, id: string) {
  // select("*") so this works before or after the optional fuel-levy / supplier-address columns exist.
  const { data: po } = await supabase.from("purchase_orders").select("*, suppliers(*)").eq("id", id).single();
  if (!po) return null;
  const { data: lines } = await supabase
    .from("purchase_order_lines")
    .select("qty_pks, unit_cost, parts(code, name)")
    .eq("purchase_order_id", id);
  const sup = (po as any).suppliers || null;
  const bytes = await buildPoPdf({ po: po as any, supplier: sup, lines: (lines ?? []) as any });

  const contacts: EmailContact[] = Array.isArray(sup?.email_contacts) ? sup.email_contacts : [];
  let to = contacts.filter((c) => c?.po && c.email).map((c) => c.email as string);
  if (to.length === 0) to = [sup?.po_email, sup?.email].filter(Boolean) as string[];
  to = Array.from(new Set(to.map((e) => e.trim()).filter(Boolean)));
  return { bytes, po, supplierName: (sup?.name as string) || "", to };
}
