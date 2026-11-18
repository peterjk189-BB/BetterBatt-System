import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SiteVisitEditor from "../SiteVisitEditor";

export default async function NewSiteVisitPage({ searchParams }: { searchParams: { project_id?: string } }) {
  const supabase = await createClient();
  const [{ data: customers }, { data: staff }, role] = await Promise.all([
    supabase.from("customers").select("id, name, contact_phone, contact_email").eq("archived", false).order("name"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    getEffectiveRole(),
  ]);

  let fromQuote: any = null;
  if (searchParams.project_id) {
    const { data: p } = await supabase
      .from("projects")
      .select("id, quote_number, revision_letter, customer_id, address, suburb, contact_name, contact_phone, contact_email, customers(name, contact_phone, contact_email)")
      .eq("id", searchParams.project_id)
      .maybeSingle();
    if (p) {
      const c: any = Array.isArray((p as any).customers) ? (p as any).customers[0] : (p as any).customers;
      fromQuote = {
        project_id: p.id,
        quote_number: p.quote_number,
        revision_letter: p.revision_letter ?? null,
        customer_id: p.customer_id || "",
        customer_name: c?.name || "",
        phone: p.contact_phone || c?.contact_phone || "",
        email: p.contact_email || c?.contact_email || "",
        address: p.address || "",
        suburb: p.suburb || "",
      };
    }
  }

  return (
    <SiteVisitEditor fromQuote={fromQuote} visit={null} photos={[]} customers={customers ?? []} staff={staff ?? []} isAdmin={role === "admin"} crmEnabled={role === "admin" || role === "office"} />
  );
}
