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
          .select("part_id, note, task_date, completed, sort_order, parts(name, type, code), labour_items(code, description)")
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
      }}
      woNumber={(wo as any)?.wo_number ?? null}
      installedOn={installedOn}
      derivedRows={rowsFromWorkOrderLines((lines ?? []) as any)}
      saved={saved}
      company={{ abn: (settings as any)?.abn ?? null, phone: (settings as any)?.company_phone ?? null }}
    />
  );
}
