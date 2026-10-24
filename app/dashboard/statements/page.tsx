import { createClient } from "@/lib/supabase/server";
import { ageingOf, statementRows, type StatementInvoice, type StatementPayment } from "@/lib/statements";
import StatementsList from "./StatementsList";

export default async function StatementsPage({ searchParams }: { searchParams: { date?: string } }) {
  const sp = searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const [{ data: invoices }, { data: payments }, custRes, logRes] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, customer_id, description, customer_po, total, status, invoice_date, due_date").neq("status", "Void").not("customer_id", "is", null),
    supabase.from("invoice_payments").select("invoice_id, paid_on, amount"),
    supabase.from("customers").select("id, name, payment_terms, contact_email, accounts_contact_name, accounts_contact_email, statement_account"),
    supabase.from("customer_statements").select("customer_id, sent_at").order("sent_at", { ascending: false }),
  ]);
  let customers = custRes.data as any[] | null;
  let needsMigration = false;
  if (custRes.error) {
    needsMigration = true;
    const r = await supabase.from("customers").select("id, name, payment_terms, contact_email, accounts_contact_name, accounts_contact_email");
    customers = (r.data ?? []) as any[];
  }
  const lastSent: Record<string, string> = {};
  for (const l of (logRes.data ?? []) as any[]) if (!lastSent[l.customer_id]) lastSent[l.customer_id] = l.sent_at;

  const byCust = new Map<string, StatementInvoice[]>();
  for (const i of (invoices ?? []) as StatementInvoice[]) {
    if (!i.customer_id) continue;
    byCust.set(i.customer_id, [...(byCust.get(i.customer_id) ?? []), i]);
  }
  const pays = (payments ?? []) as StatementPayment[];
  const rows = (customers ?? [])
    .map((c) => {
      const ageing = ageingOf(statementRows(byCust.get(c.id) ?? [], pays, date));
      return {
        id: c.id as string,
        name: c.name as string,
        terms: (c.payment_terms as string) || "",
        email: (c.accounts_contact_email || c.contact_email || "") as string,
        accountHolder: !!c.statement_account,
        ageing,
        lastSent: lastSent[c.id] ?? null,
      };
    })
    .filter((r) => r.ageing.total > 0.005 || r.accountHolder)
    .sort((a, b) => a.name.localeCompare(b.name));
  return <StatementsList rows={rows} date={date} needsMigration={needsMigration || !!logRes.error} />;
}
