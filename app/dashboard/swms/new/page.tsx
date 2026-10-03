import { createClient } from "@/lib/supabase/server";
import { getEffectiveRole } from "@/lib/currentUser";
import SwmsEditor from "../SwmsEditor";

export default async function NewSwmsPage({
  searchParams,
}: {
  searchParams: { work_order_id?: string; project_id?: string };
}) {
  const supabase = await createClient();
  const role = await getEffectiveRole();

  let prefill: {
    work_order_id?: string;
    project_id?: string;
    site_address?: string;
    suburb?: string;
    builder_name?: string;
  } | null = null;

  if (searchParams.work_order_id) {
    const { data: wo } = await supabase
      .from("work_orders")
      .select("id, project_id, projects(address, suburb, customers(name))")
      .eq("id", searchParams.work_order_id)
      .single();
    if (wo) {
      const project = (wo as any).projects;
      prefill = {
        work_order_id: wo.id,
        project_id: wo.project_id || undefined,
        site_address: project?.address || "",
        suburb: project?.suburb || "",
        builder_name: project?.customers?.name || "",
      };
    }
  } else if (searchParams.project_id) {
    const { data: p } = await supabase
      .from("projects")
      .select("id, address, suburb, customers(name)")
      .eq("id", searchParams.project_id)
      .single();
    if (p) {
      prefill = {
        project_id: p.id,
        site_address: p.address || "",
        suburb: p.suburb || "",
        builder_name: (p as any).customers?.name || "",
      };
    }
  }

  return <SwmsEditor record={null} photos={[]} prefill={prefill} isAdmin={role === "admin"} />;
}
