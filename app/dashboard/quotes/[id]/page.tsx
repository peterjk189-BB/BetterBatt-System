import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuoteEditor from "../QuoteEditor";

export default async function QuotePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: project }, { data: lines }, { data: customers }, { data: parts }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", params.id).single(),
    supabase.from("project_lines").select("*").eq("project_id", params.id).order("sort_order"),
    supabase.from("customers").select("*").eq("archived", false).order("name"),
    supabase.from("parts").select("*").eq("archived", false).order("name"),
  ]);

  if (!project) notFound();

  return (
    <QuoteEditor
      project={project}
      lines={lines ?? []}
      customers={customers ?? []}
      parts={parts ?? []}
    />
  );
}
