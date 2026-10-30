import { lineRate } from "@/lib/woRate";
import { jobProgress } from "@/lib/jobProgress";

export type InvoiceLine = { description: string; qty: number; unit: string; rate: number; amount: number };
export type UnapprovedExtra = { description: string; qty: number };

export type InvoiceDraft = {
  contractor_name: string;
  contractor_abn: string | null;
  gst_registered: boolean;
  bank_account_name: string | null;
  bank_bsb: string | null;
  bank_account_number: string | null;
  site: string;
  wo_number: string;
  completed_date: string | null;
  lines: InvoiceLine[];
  line_ids: string[];
  unapproved_extras: UnapprovedExtra[];
  subtotal_ex: number;
  gst: number;
  total: number;
  swms_ok: boolean;
  inspection_ok: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function fmtAbn(abn: string | null | undefined) {
  const d = (abn || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : abn || "";
}

/** "BN-0042": the contractor's initials and their own running number. */
export function invoiceNumber(name: string, seq: number) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w[0].toUpperCase())
      .join("") || "INV";
  return `${initials}-${String(seq).padStart(4, "0")}`;
}

/**
 * Works out what a contractor can invoice for a work order right now, from the database (never from the browser):
 * their work order lines not already on an invoice, the unapproved extras, and whether the SWMS and inspection are done.
 * `admin` is the service-role client, `subId` the contractor.
 */
export async function buildInvoiceDraft(admin: any, workOrderId: string, subId: string): Promise<{ draft?: InvoiceDraft; error?: string; alreadyBilled?: boolean }> {
  const [{ data: sub }, { data: wo }] = await Promise.all([
    admin.from("subcontractors").select("*").eq("id", subId).single(),
    admin.from("work_orders").select("id, wo_number, contractor_id, completed_date, projects(lot_no, address, suburb)").eq("id", workOrderId).single(),
  ]);
  if (!sub || !wo) return { error: "Work order or contractor not found." };

  const selBase = "id, qty, subcontractor_id, parts(name, installer_rate_per_m2, coverage_m2)";
  let linesRes: any = await admin.from("work_order_lines").select(selBase + ", rate, description, task_date").eq("work_order_id", workOrderId).order("sort_order");
  if (linesRes.error) linesRes = await admin.from("work_order_lines").select(selBase).eq("work_order_id", workOrderId).order("sort_order");
  const allLines: any[] = linesRes.data ?? [];
  const mine = allLines.filter((l) => (l.subcontractor_id ? l.subcontractor_id === subId : wo.contractor_id === subId));

  const { data: prev } = await admin.from("contractor_invoices").select("line_ids, status").eq("work_order_id", workOrderId).eq("subcontractor_id", subId).neq("status", "Rejected");
  const billed = new Set<string>(((prev ?? []) as any[]).flatMap((p) => p.line_ids ?? []));
  const open = mine.filter((l) => !billed.has(l.id));

  const lines: InvoiceLine[] = open
    .map((l) => {
      const rate = lineRate(l.rate, null, l.parts?.installer_rate_per_m2 ?? null);
      const qty = Number(l.qty) || 0;
      return { description: l.parts?.name || l.description || "Work", qty, unit: "m²", rate, amount: r2(qty * rate) };
    })
    .filter((l) => l.qty > 0);

  const { data: extras } = await admin.from("work_order_extras").select("description, qty, status").eq("work_order_id", workOrderId).eq("subcontractor_id", subId).eq("status", "Pending");
  const unapproved: UnapprovedExtra[] = ((extras ?? []) as any[]).map((e) => ({ description: e.description, qty: Number(e.qty) || 1 }));

  const [{ data: swms }, { data: ins }] = await Promise.all([
    admin.from("swms").select("id, status, archived").eq("work_order_id", workOrderId),
    admin.from("inspections").select("id, inspection_number, status, result, parent_inspection_id, archived").eq("work_order_id", workOrderId),
  ]);
  const prog = jobProgress((swms ?? []) as any, (ins ?? []) as any);

  const subtotal = r2(lines.reduce((a, l) => a + l.amount, 0));
  const gst = sub.gst_registered ? r2(subtotal * 0.1) : 0;
  const p: any = Array.isArray(wo.projects) ? wo.projects[0] : wo.projects;
  const site = [p?.lot_no ? `Lot ${p.lot_no}` : "", p?.address, p?.suburb].filter(Boolean).join(", ");

  return {
    alreadyBilled: lines.length === 0 && billed.size > 0,
    draft: {
      contractor_name: sub.company_name || sub.name,
      contractor_abn: sub.abn || null,
      gst_registered: !!sub.gst_registered,
      bank_account_name: sub.bank_account_name || null,
      bank_bsb: sub.bank_bsb || null,
      bank_account_number: sub.bank_account_number || null,
      site,
      wo_number: String(wo.wo_number),
      completed_date: wo.completed_date || null,
      lines,
      line_ids: open.filter((l) => (Number(l.qty) || 0) > 0).map((l) => l.id),
      unapproved_extras: unapproved,
      subtotal_ex: subtotal,
      gst,
      total: r2(subtotal + gst),
      swms_ok: prog.swmsDone,
      inspection_ok: prog.stage === "passed",
    },
  };
}
