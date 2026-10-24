import { ageingOf, recentPayments, statementRows, type StatementInvoice, type StatementPayment } from "@/lib/statements";
import { buildStatementPdf } from "@/lib/statementPdf";

/** Everything a statement needs for one customer as at a date, plus the PDF bytes. */
export async function loadStatement(supabase: any, customerId: string, asOf: string) {
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, payment_terms, contact_name, contact_email, accounts_contact_name, accounts_contact_email, accounts_contact_phone")
    .eq("id", customerId)
    .single();
  if (!customer) return null;

  const [{ data: invoices }, { data: settings }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, description, customer_po, total, status, invoice_date, due_date")
      .eq("customer_id", customerId)
      .neq("status", "Void"),
    supabase.from("company_settings").select("abn, company_phone, invoice_bank_details, invoice_footer").eq("id", true).maybeSingle(),
  ]);
  const inv = (invoices ?? []) as StatementInvoice[];
  const ids = inv.map((i) => i.id);
  const { data: pays } = ids.length ? await supabase.from("invoice_payments").select("invoice_id, paid_on, amount, method, reference").in("invoice_id", ids) : { data: [] as any[] };
  const payments = (pays ?? []) as StatementPayment[];

  const rows = statementRows(inv, payments, asOf);
  const ageing = ageingOf(rows);
  const recent = recentPayments(inv, payments, asOf);
  const email = customer.accounts_contact_email || customer.contact_email || "";
  const bytes = await buildStatementPdf({
    customer,
    asOf,
    rows,
    ageing,
    recent,
    company: { abn: settings?.abn, phone: settings?.company_phone, bankDetails: settings?.invoice_bank_details, footer: settings?.invoice_footer },
  });
  return { customer, rows, ageing, recent, email, bytes };
}
