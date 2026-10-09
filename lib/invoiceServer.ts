import { createClient } from "@/lib/supabase/server";
import { siteAddress } from "@/lib/siteAddress";
import { paidTotal, type Invoice, type Payment } from "@/lib/invoices";
import { buildInvoicePdf } from "@/lib/invoicePdf";

/** Signed-in admin/office user, or null. */
export async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "office") return null;
  return { supabase, user };
}

export async function loadInvoicePdf(supabase: any, id: string) {
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!inv) return null;
  const [{ data: payments }, { data: customer }, { data: project }, { data: settings }] = await Promise.all([
    supabase.from("invoice_payments").select("*").eq("invoice_id", id),
    inv.customer_id ? supabase.from("customers").select("name, contact_email").eq("id", inv.customer_id).single() : Promise.resolve({ data: null }),
    inv.project_id ? supabase.from("projects").select("quote_number, lot_no, address, suburb, contact_email").eq("id", inv.project_id).single() : Promise.resolve({ data: null }),
    supabase.from("company_settings").select("abn, company_phone, invoice_bank_details, invoice_footer").eq("id", true).maybeSingle(),
  ]);
  const bytes = await buildInvoicePdf({
    invoice: inv as Invoice,
    customerName: customer?.name || "",
    customerEmail: customer?.contact_email || project?.contact_email || null,
    siteAddress: inv.site_address || (project ? siteAddress(project as any) : null),
    quoteNumber: project?.quote_number ?? null,
    paid: paidTotal((payments ?? []) as Payment[]),
    company: { abn: settings?.abn, phone: settings?.company_phone, bankDetails: settings?.invoice_bank_details, footer: settings?.invoice_footer },
  });
  return { bytes, inv: inv as Invoice, customerEmail: customer?.contact_email || project?.contact_email || null, customerName: customer?.name || "" };
}
