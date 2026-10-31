import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import { computeRating, type Grade, type RatingInvoice, type RatingNote, type RatingPayment } from "@/lib/builderRating";
import CustomersTable from "./CustomersTable";

export default async function CustomersPage() {
  const supabase = await createClient();
  const [{ data }, role] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    getEffectiveRole(),
  ]);
  const staff = role === "admin" || role === "office";

  // Suggested grade per customer (staff only). Tables may not exist until migration 0080 is run, so every query is optional.
  const grades: Record<string, Grade | null> = {};
  if (staff) {
    const [inv, pay, notes]: any[] = await Promise.all([
      supabase.from("invoices").select("id, customer_id, invoice_number, status, total, invoice_date, due_date"),
      supabase.from("invoice_payments").select("invoice_id, paid_on, amount"),
      supabase.from("customer_notes").select("id, customer_id, category, severity, note, created_at, created_by_name, project_id"),
    ]);
    const invBy = new Map<string, RatingInvoice[]>();
    for (const i of inv.data ?? []) {
      if (!i.customer_id) continue;
      if (!invBy.has(i.customer_id)) invBy.set(i.customer_id, []);
      invBy.get(i.customer_id)!.push(i);
    }
    const noteBy = new Map<string, RatingNote[]>();
    for (const n of notes.error ? [] : notes.data ?? []) {
      if (!noteBy.has(n.customer_id)) noteBy.set(n.customer_id, []);
      noteBy.get(n.customer_id)!.push(n);
    }
    const pays: RatingPayment[] = pay.data ?? [];
    for (const c of (data ?? []) as any[]) {
      const list = invBy.get(c.id) ?? [];
      const ids = new Set(list.map((i) => i.id));
      grades[c.id] = computeRating(list, pays.filter((p) => ids.has(p.invoice_id)), noteBy.get(c.id) ?? [], null).auto;
    }
  }

  return <CustomersTable initial={data ?? []} isAdmin={role === "admin"} crmEnabled={staff} grades={grades} />;
}
