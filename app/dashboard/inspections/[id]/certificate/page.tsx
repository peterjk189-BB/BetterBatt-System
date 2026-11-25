import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseSaved, rowsFromWorkOrderLines } from "@/lib/certificate";
import CertificateView from "./CertificateView";

export default async function CertificatePage({ params }: { params: { id: string } }) {
  // Reading the inspection with the signed-in user's client is the access
  // check; the work order's materials are then read with the admin client
  // so anyone allowed to see the inspection gets a complete certificate.
  const supabase = await createClient();
  const { data: ins } = await supabase.from("inspections").select("*").eq("id", params.id).single();
  if (!ins) notFound();

  const admin = createAdminClient();
  const [{ data: wo }, { data: lines }, { data: swms }, { data: settings }] = await Promise.all([
    ins.work_order_id
      ? admin.from("work_orders").select("wo_number, completed_date").eq("id", ins.work_order_id).single()
      : Promise.resolve({ data: null }),
    ins.work_order_id
      ? admin
          .from("work_order_lines")
          .select("part_id, note, task_date, completed, sort_order, parts(name, type, code, is_stock_item), labour_items(code, description)")
          .eq("work_order_id", ins.work_order_id)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    ins.work_order_id
      ? admin
          .from("swms")
          .select("job_date, status")
          .eq("work_order_id", ins.work_order_id)
          .eq("archived", false)
          .order("job_date", { ascending: false })
      : Promise.resolve({ data: [] }),
    admin.from("company_settings").select("*").eq("id", true).single(),
  ]);

  // Date installed: the work order's completed date, else the last task date,
  // else the installer's SWMS date, else the inspection date.
  const taskDates = ((lines ?? []) as any[]).map((l) => l.task_date).filter(Boolean).sort();
  const swmsDate = ((swms ?? []) as any[]).find((s) => s.status === "Completed")?.job_date || (swms ?? [])[0]?.job_date;
  const installedOn: string = (wo as any)?.completed_date || taskDates[taskDates.length - 1] || swmsDate || ins.inspection_date;

  const saved = normaliseSaved(ins.certificate);

  // Who the certificate can be emailed to: the customer's emails on file (the inspection's customer,
  // else the quote's customer via the work order), plus any other contacts with an email.
  let customerId: string | null = (ins as any).customer_id ?? null;
  let projectId: string | null = (ins as any).project_id ?? null;
  if (!projectId && ins.work_order_id) {
    const { data: w } = await admin.from("work_orders").select("project_id").eq("id", ins.work_order_id).single();
    projectId = (w as any)?.project_id ?? null;
  }
  if (!customerId && projectId) {
    const { data: p } = await admin.from("projects").select("customer_id").eq("id", projectId).single();
    customerId = (p as any)?.customer_id ?? null;
  }
  let customer: { id: string; name: string; contact_email: string | null } | null = null;
  const recipients: { label: string; email: string }[] = [];
  if (customerId) {
    const { data: c } = await admin.from("customers").select("*").eq("id", customerId).single();
    if (c) {
      customer = { id: (c as any).id, name: (c as any).name, contact_email: (c as any).contact_email ?? null };
      if ((c as any).contact_email) recipients.push({ label: (c as any).contact_name || (c as any).name || "Customer", email: (c as any).contact_email });
      if ((c as any).accounts_contact_email) recipients.push({ label: `Accounts${(c as any).accounts_contact_name ? ` – ${(c as any).accounts_contact_name}` : ""}`, email: (c as any).accounts_contact_email });
      // Other contacts (migration 0101); ignored if that table isn't there.
      const { data: others } = await admin.from("customer_contacts").select("name, role, email").eq("customer_id", customerId);
      for (const o of (others ?? []) as any[]) if (o.email) recipients.push({ label: [o.name, o.role].filter(Boolean).join(" – ") || "Contact", email: o.email });
    }
  }
  const seen = new Set<string>();
  const uniqueRecipients = recipients.filter((r) => {
    const k = r.email.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <CertificateView
      inspection={{
        id: ins.id,
        inspection_number: ins.inspection_number,
        inspection_date: ins.inspection_date,
        result: ins.result,
        builder_name: ins.builder_name,
        site_address: ins.site_address,
        suburb: ins.suburb,
        inspector_name: ins.inspector_name,
        inspector_signature: ins.inspector_signature,
        signed_at: ins.signed_at,
        certificate_sent_at: (ins as any).certificate_sent_at ?? null,
      }}
      woNumber={(wo as any)?.wo_number ?? null}
      installedOn={installedOn}
      derivedRows={rowsFromWorkOrderLines((lines ?? []) as any)}
      saved={saved}
      company={{ abn: (settings as any)?.abn ?? null, phone: (settings as any)?.company_phone ?? null }}
      customer={customer}
      recipients={uniqueRecipients}
    />
  );
}
