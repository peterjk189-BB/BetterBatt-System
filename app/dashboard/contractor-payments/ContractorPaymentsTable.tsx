"use client";

import { PhoneLink } from "../CallLink";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { lineRate } from "@/lib/woRate";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { downloadContractorPdf, type ContractorPdfRow } from "@/lib/contractorPdf";
import { downloadWeekSummaryPdf, weekSummaryPdfBase64, mondayOfDay, addDays } from "@/lib/contractorWeekPdf";
import { todayAU } from "@/lib/dates";

type Sub = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gst_registered: boolean;
  company_name?: string | null;
  trading_name?: string | null;
  abn?: string | null;
  bank_account_name?: string | null;
  bank_bsb?: string | null;
  bank_account_number?: string | null;
};

type Line = {
  id: string;
  work_order_id: string;
  qty: number;
  paid: boolean;
  task_date: string | null;
  note: string | null;
  subcontractor_id: string | null;
  work_orders: {
    wo_number: string;
    contractor_id: string | null;
    archived: boolean;
    projects: {
      quote_number: number;
      address: string | null;
      suburb: string | null;
      customers: { name: string } | null;
    } | null;
  } | null;
  labour_items: { code: string; description: string; contractor_rate: number } | null;
  rate?: number | null;
  parts?: { name: string; installer_rate_per_m2: number } | null;
};

type StatusFilter = "all" | "unpaid" | "paid";

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-AU") : "—";
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ContractorPaymentsTable({ subs, lines }: { subs: Sub[]; lines: Line[] }) {
  const supabase = createClient();
  const [paidOverrides, setPaidOverrides] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [view, setView] = useState<"contractor" | "weekly">("contractor");
  const [wkStatus, setWkStatus] = useState<StatusFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("unpaid");
  const [contractorFilter, setContractorFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Weekly summary PDF: any date in the week; defaults to last week (the usual pay run).
  const [weekDay, setWeekDay] = useState(() => addDays(mondayOfDay(new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" })), -7));

  const computed = useMemo(
    () =>
      lines
        .filter((l) => l.work_orders && !l.work_orders.archived)
        .map((l) => {
          const rate = lineRate(l.rate, l.labour_items?.contractor_rate, l.parts?.installer_rate_per_m2);
          const cost = (Number(l.qty) || 0) * rate;
          const contractorId = l.subcontractor_id || l.work_orders?.contractor_id || null;
          const paid = paidOverrides[l.id] ?? l.paid;
          return { ...l, cost, contractorId, paid };
        }),
    [lines, paidOverrides]
  );

  const unassignedLines = computed.filter((l) => !l.contractorId);

  // Apply the status/date/contractor filters once, shared by the summary report,
  // the per-contractor cards and the CSV export.
  const filtered = useMemo(
    () =>
      computed.filter((l) => {
        if (!l.contractorId) return false;
        if (status === "unpaid" && l.paid) return false;
        if (status === "paid" && !l.paid) return false;
        if (contractorFilter && l.contractorId !== contractorFilter) return false;
        if (dateFrom && (!l.task_date || l.task_date < dateFrom)) return false;
        if (dateTo && (!l.task_date || l.task_date > dateTo)) return false;
        return true;
      }),
    [computed, status, contractorFilter, dateFrom, dateTo]
  );

  const byContractor = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const l of filtered) {
      const arr = map.get(l.contractorId as string) || [];
      arr.push(l);
      map.set(l.contractorId as string, arr);
    }
    return map;
  }, [filtered]);

  async function togglePaid(line: (typeof computed)[number]) {
    const next = !line.paid;
    setPaidOverrides((prev) => ({ ...prev, [line.id]: next }));
    setSavingId(line.id);
    const { error } = await supabase.from("work_order_lines").update({ paid: next }).eq("id", line.id);
    setSavingId(null);
    if (error) {
      // Revert on failure.
      setPaidOverrides((prev) => ({ ...prev, [line.id]: line.paid }));
      alert(`Failed to update: ${error.message}`);
      return;
    }
    logAudit(supabase, {
      eventType: "update",
      entityType: "work_order_line_payment",
      entityId: line.id,
      entityLabel: line.work_orders?.wo_number || "Work order line",
      details: next ? "Marked paid" : "Marked unpaid",
    });
  }

  const summaryRows = subs
    .map((s) => {
      const subLines = byContractor.get(s.id) || [];
      const owed = subLines.filter((l) => !l.paid).reduce((sum, l) => sum + l.cost, 0);
      const paidTotal = subLines.filter((l) => l.paid).reduce((sum, l) => sum + l.cost, 0);
      const gst = s.gst_registered ? owed * 0.1 : 0;
      const owedWithGst = owed + gst;
      return { sub: s, lines: subLines, owed, paidTotal, gst, owedWithGst, total: owed + paidTotal };
    })
    .filter((row) => row.lines.length > 0)
    .sort((a, b) => b.owed - a.owed);

  const contractorRows = summaryRows.filter((row) => row.sub.name.toLowerCase().includes(search.toLowerCase()));

  const grandOwed = summaryRows.reduce((s, r) => s + r.owed, 0);
  const grandGst = summaryRows.reduce((s, r) => s + r.gst, 0);
  const grandPaid = summaryRows.reduce((s, r) => s + r.paidTotal, 0);
  const grandLines = summaryRows.reduce((s, r) => s + r.lines.length, 0);

  // One PDF per contractor: lines shown on their card, rolled up to one row per work order.
  async function exportPdf(row: (typeof summaryRows)[number]) {
    const byWo = new Map<string, ContractorPdfRow>();
    for (const l of row.lines) {
      const key = l.work_order_id;
      const p = l.work_orders?.projects;
      const existing = byWo.get(key);
      if (existing) {
        existing.exGst += l.cost;
        if (l.task_date && (!existing.date || l.task_date > existing.date)) existing.date = l.task_date;
      } else {
        byWo.set(key, {
          woNumber: l.work_orders?.wo_number || "—",
          date: l.task_date,
          address: p ? [p.address, p.suburb].filter(Boolean).join(", ") : "",
          exGst: l.cost,
        });
      }
    }
    try {
      await downloadContractorPdf({
        contractorName: row.sub.name,
        gstRegistered: row.sub.gst_registered,
        rows: Array.from(byWo.values()),
      });
    } catch (e: any) {
      alert(`Couldn't create the PDF: ${e?.message || e}`);
    }
  }

  // One page for the whole week (Mon–Sun by work date): every contractor paid for the week, regardless of the filters above.
  function weekPdfRows(start: string) {
    const end = addDays(start, 6);
    const map = new Map<string, { jobs: Set<string>; exGst: number }>();
    for (const l of computed) {
      if (!l.contractorId || !l.paid || !l.task_date || l.task_date < start || l.task_date > end) continue;
      const e = map.get(l.contractorId) ?? { jobs: new Set<string>(), exGst: 0 };
      e.jobs.add(l.work_order_id);
      e.exGst += l.cost;
      map.set(l.contractorId, e);
    }
    return subs
      .filter((s) => map.has(s.id))
      .map((s) => {
        const e = map.get(s.id)!;
        return {
          name: s.name,
          company: s.company_name || s.trading_name || "",
          abn: s.abn || "",
          bankName: s.bank_account_name || "",
          bsb: s.bank_bsb || "",
          account: s.bank_account_number || "",
          gstRegistered: s.gst_registered,
          jobs: e.jobs.size,
          exGst: e.exGst,
        };
      });
  }
  async function exportWeekPdf() {
    try {
      const start = mondayOfDay(weekDay);
      await downloadWeekSummaryPdf(start, weekPdfRows(start));
    } catch (e: any) {
      alert(`Couldn't create the PDF: ${e?.message || e}`);
    }
  }

  const ACCOUNTS_EMAIL = "kradford@regencyplaster.com.au";
  const [emailing, setEmailing] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ start: string; pdf: string; url: string; contractors: number; exGst: number } | null>(null);
  // Step 1: build the PDF and show it for checking. Nothing is sent yet.
  async function previewWeekPdf() {
    const start = mondayOfDay(weekDay);
    const rows = weekPdfRows(start);
    setEmailMsg(null);
    if (rows.length === 0) {
      setEmailMsg("Nothing paid for that week, so there is nothing to send.");
      return;
    }
    try {
      const pdf = await weekSummaryPdfBase64(start, rows);
      const bin = atob(pdf);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setPreview({ start, pdf, url, contractors: rows.length, exGst: rows.reduce((t, r) => t + r.exGst, 0) });
    } catch (e: any) {
      setEmailMsg(`Couldn't create the PDF: ${e?.message || e}`);
    }
  }
  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }
  // Step 2: send exactly what was previewed.
  async function sendPreviewed() {
    if (!preview) return;
    setEmailing(true);
    try {
      const res = await fetch("/api/contractor-payments/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: preview.start, to: ACCOUNTS_EMAIL, pdf: preview.pdf, contractors: preview.contractors, exGst: preview.exGst }),
      });
      const j = await res.json().catch(() => ({}));
      setEmailMsg(res.ok ? `Sent to ${ACCOUNTS_EMAIL}.` : `Not sent: ${j.error || res.status}`);
      if (res.ok) closePreview();
    } catch (e: any) {
      setEmailMsg(`Not sent: ${e?.message || e}`);
    }
    setEmailing(false);
  }

  // ---- Weekly tab: Monday to Sunday by work date, a total per job and per contractor ----
  const wkStart = mondayOfDay(weekDay);
  const wkEnd = addDays(wkStart, 6);
  const weekRows = useMemo(() => {
    const byC = new Map<string, Map<string, typeof computed>>();
    for (const l of computed) {
      if (!l.contractorId || !l.task_date || l.task_date < wkStart || l.task_date > wkEnd) continue;
      if (wkStatus === "unpaid" && l.paid) continue;
      if (wkStatus === "paid" && !l.paid) continue;
      const jobs = byC.get(l.contractorId) ?? new Map<string, typeof computed>();
      jobs.set(l.work_order_id, [...(jobs.get(l.work_order_id) ?? []), l]);
      byC.set(l.contractorId, jobs);
    }
    return subs
      .filter((s) => byC.has(s.id))
      .map((s) => {
        const jobs = Array.from(byC.get(s.id)!.entries())
          .map(([woId, ls]) => ({
            woId,
            first: ls[0],
            lines: ls.length,
            total: ls.reduce((t, l) => t + l.cost, 0),
            unpaid: ls.filter((l) => !l.paid).reduce((t, l) => t + l.cost, 0),
            days: Array.from(new Set(ls.map((l) => l.task_date as string))).sort(),
          }))
          .sort((a, b) => a.days[0].localeCompare(b.days[0]));
        const total = jobs.reduce((t, j) => t + j.total, 0);
        const unpaid = jobs.reduce((t, j) => t + j.unpaid, 0);
        const gst = s.gst_registered ? total * 0.1 : 0;
        return { sub: s, jobs, total, unpaid, gst };
      })
      .sort((a, b) => b.total - a.total);
  }, [computed, subs, wkStart, wkEnd, wkStatus]);
  const weekTotal = weekRows.reduce((t, r) => t + r.total, 0);
  const weekUnpaid = weekRows.reduce((t, r) => t + r.unpaid, 0);
  const weekGst = weekRows.reduce((t, r) => t + r.gst, 0);
  const weekJobs = weekRows.reduce((t, r) => t + r.jobs.length, 0);

  function exportCsv() {
    const header = [
      "Contractor",
      "GST registered",
      "Date",
      "Work order",
      "Customer",
      "Product",
      "Qty",
      "Amount",
      "GST",
      "Amount + GST",
      "Paid",
      "Note",
    ];
    const rows: string[] = [header.join(",")];
    for (const row of contractorRows) {
      for (const l of [...row.lines].sort((a, b) => (a.task_date || "").localeCompare(b.task_date || ""))) {
        const lineGst = row.sub.gst_registered ? l.cost * 0.1 : 0;
        rows.push(
          [
            csvCell(row.sub.name),
            csvCell(row.sub.gst_registered ? "Yes" : "No"),
            csvCell(fmtDate(l.task_date)),
            csvCell(l.work_orders?.wo_number || "—"),
            csvCell(
              l.work_orders?.projects
                ? `Q${l.work_orders.projects.quote_number} — ${l.work_orders.projects.customers?.name || "—"}`
                : "—"
            ),
            csvCell(l.parts?.name || (l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—")),
            csvCell(l.qty),
            csvCell(l.cost.toFixed(2)),
            csvCell(lineGst.toFixed(2)),
            csvCell((l.cost + lineGst).toFixed(2)),
            csvCell(l.paid ? "Yes" : "No"),
            csvCell(l.note || ""),
          ].join(",")
        );
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = todayAU();
    a.href = url;
    a.download = `contractor-payments-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contractor Payments</h1>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            Week of
            <input type="date" value={weekDay} onChange={(e) => e.target.value && setWeekDay(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm text-[var(--text)]" />
          </label>
          <button
            onClick={exportWeekPdf}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            title="One PDF for the whole week (Mon–Sun by work date): every contractor paid"
          >
            Weekly summary PDF
          </button>
          <button
            onClick={previewWeekPdf}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-60"
            title={`Preview the weekly summary PDF, then email it to ${ACCOUNTS_EMAIL}`}
          >
            Preview &amp; email to accounts
          </button>
          <button
            onClick={exportCsv}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Export CSV
          </button>
        </div>
      </div>
      {emailMsg && <p className="mt-2 text-sm font-medium">{emailMsg}</p>}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Preview: contractor payments, week from {fmtDate(preview.start)}</div>
                <div className="text-sm text-[var(--muted)]">
                  To: {ACCOUNTS_EMAIL} · {preview.contractors} contractor{preview.contractors === 1 ? "" : "s"} · {fmtCurrency(preview.exGst)} ex GST. This PDF is attached to the email.
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={closePreview} disabled={emailing} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium">Cancel</button>
                <button onClick={sendPreviewed} disabled={emailing} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {emailing ? "Sending…" : "Send email"}
                </button>
              </div>
            </div>
            {emailMsg && <p className="mt-2 text-sm font-medium text-red-700">{emailMsg}</p>}
            <iframe src={preview.url} title="Weekly summary preview" className="mt-3 w-full flex-1 rounded-lg border border-[var(--border)] bg-white" />
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {([["contractor", "By contractor"], ["weekly", "Weekly (Mon to Sun)"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === k ? "bg-accent text-white" : "border border-[var(--border)] text-[var(--muted)]"}`}>
            {l}
          </button>
        ))}
      </div>

      {view === "weekly" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setWeekDay(addDays(wkStart, -7))} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" aria-label="Previous week">‹</button>
            <span className="min-w-[230px] text-center text-sm font-semibold">
              Mon {fmtDate(wkStart)} to Sun {fmtDate(wkEnd)}
            </span>
            <button onClick={() => setWeekDay(addDays(wkStart, 7))} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm" aria-label="Next week">›</button>
            <button onClick={() => setWeekDay(mondayOfDay(todayAU()))} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">This week</button>
            <button onClick={() => setWeekDay(addDays(mondayOfDay(todayAU()), -7))} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">Last week</button>
            <select value={wkStatus} onChange={(e) => setWkStatus(e.target.value as StatusFilter)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]">
              <option value="all">All lines</option>
              <option value="unpaid">Unpaid only</option>
              <option value="paid">Paid only</option>
            </select>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Week total (ex GST)</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(weekTotal)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">GST (registered contractors)</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(weekGst)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Still unpaid</div>
              <div className="mt-1 text-2xl font-bold text-red-700">{fmtCurrency(weekUnpaid)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Jobs this week</div>
              <div className="mt-1 text-2xl font-bold">{weekJobs}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            {weekRows.length === 0 && (
              <div className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-[var(--muted)]">No contractor work dated in this week.</div>
            )}
            {weekRows.map(({ sub, jobs, total, unpaid, gst }) => (
              <div key={sub.id} className="rounded-xl border border-[var(--border)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[#f2f0ec] px-4 py-3">
                  <div className="font-semibold">
                    {sub.name}
                    {sub.gst_registered && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-normal text-blue-800">GST registered</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div><span className="text-[var(--muted)]">Week </span><span className="font-bold">{fmtCurrency(total)}</span></div>
                    {sub.gst_registered && <div><span className="text-[var(--muted)]">+ GST </span><span className="font-semibold">{fmtCurrency(total + gst)}</span></div>}
                    <div><span className="text-[var(--muted)]">Unpaid </span><span className={`font-semibold ${unpaid > 0.005 ? "text-red-700" : ""}`}>{fmtCurrency(unpaid)}</span></div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-sm">
                    <thead className="text-left text-xs uppercase text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-2">Work order</th>
                        <th className="px-4 py-2">Customer / site</th>
                        <th className="px-4 py-2">Days worked</th>
                        <th className="px-4 py-2 text-right">Lines</th>
                        <th className="px-4 py-2 text-right">Job total</th>
                        <th className="px-4 py-2 text-right">Unpaid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((j) => {
                        const p = j.first.work_orders?.projects;
                        return (
                          <tr key={j.woId} className="border-t border-[var(--border)]">
                            <td className="px-4 py-2">
                              <Link href={`/dashboard/work-orders/${j.woId}`} className="text-accent hover:underline">{j.first.work_orders?.wo_number || "—"}</Link>
                            </td>
                            <td className="px-4 py-2 text-[var(--muted)]">
                              {p ? `Q${p.quote_number} — ${p.customers?.name || "—"}` : "—"}
                              {p && [p.address, p.suburb].filter(Boolean).length > 0 && <div className="text-xs">{[p.address, p.suburb].filter(Boolean).join(", ")}</div>}
                            </td>
                            <td className="px-4 py-2 text-[var(--muted)]">{j.days.map((d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })).join(", ")}</td>
                            <td className="px-4 py-2 text-right text-[var(--muted)]">{j.lines}</td>
                            <td className="px-4 py-2 text-right font-medium">{fmtCurrency(j.total)}</td>
                            <td className={`px-4 py-2 text-right ${j.unpaid > 0.005 ? "text-red-700" : "text-[var(--muted)]"}`}>{j.unpaid > 0.005 ? fmtCurrency(j.unpaid) : "Paid"}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-[var(--border)] bg-[#f2f0ec] font-semibold">
                        <td className="px-4 py-2" colSpan={4}>{sub.name} week total</td>
                        <td className="px-4 py-2 text-right">{fmtCurrency(total)}</td>
                        <td className="px-4 py-2 text-right">{unpaid > 0.005 ? fmtCurrency(unpaid) : "Paid"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "contractor" && (
        <>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Owed (filtered)</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{fmtCurrency(grandOwed)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">GST on owed (filtered)</div>
          <div className="mt-1 text-2xl font-bold">{fmtCurrency(grandGst)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Paid (filtered)</div>
          <div className="mt-1 text-2xl font-bold">{fmtCurrency(grandPaid)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Task lines (filtered)</div>
          <div className="mt-1 text-2xl font-bold">{grandLines}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border border-[var(--border)] bg-[#f2f0ec] p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]"
          >
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
          Contractor
          <select
            value={contractorFilter}
            onChange={(e) => setContractorFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]"
          >
            <option value="">All contractors</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
          Search
          <input
            placeholder="Filter by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]"
          />
        </label>
        {(dateFrom || dateTo || contractorFilter || search || status !== "unpaid") && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setContractorFilter("");
              setSearch("");
              setStatus("unpaid");
            }}
            className="text-sm text-[var(--muted)] hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>

      {contractorRows.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2">Contractor</th>
                <th className="px-4 py-2">GST reg.</th>
                <th className="px-4 py-2 text-right">Lines</th>
                <th className="px-4 py-2 text-right">Owed</th>
                <th className="px-4 py-2 text-right">GST</th>
                <th className="px-4 py-2 text-right">Owed + GST</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {contractorRows.map(({ sub, lines: subLines, owed, paidTotal, gst, owedWithGst, total }) => (
                <tr key={sub.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 font-medium">
                    <a href={`#contractor-${sub.id}`} className="hover:underline">
                      {sub.name}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-[var(--muted)]">{sub.gst_registered ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right text-[var(--muted)]">{subLines.length}</td>
                  <td className="px-4 py-2 text-right font-medium text-red-700">{fmtCurrency(owed)}</td>
                  <td className="px-4 py-2 text-right">{sub.gst_registered ? fmtCurrency(gst) : "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-700">
                    {sub.gst_registered ? fmtCurrency(owedWithGst) : fmtCurrency(owed)}
                  </td>
                  <td className="px-4 py-2 text-right">{fmtCurrency(paidTotal)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{fmtCurrency(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {contractorRows.map((cRow) => {
          const { sub, lines: subLines, owed, paidTotal, gst, owedWithGst } = cRow;
          // Group the lines by work order (most recent job first) so each job gets a total.
          const woGroups = (() => {
            const m = new Map<string, typeof subLines>();
            for (const l of subLines) m.set(l.work_order_id, [...(m.get(l.work_order_id) ?? []), l]);
            const latest = (ls: typeof subLines) => ls.reduce((d, l) => ((l.task_date || "") > d ? l.task_date || "" : d), "");
            return Array.from(m.entries())
              .map(([woId, ls]) => ({
                woId,
                lines: [...ls].sort((x, y) => (x.task_date || "").localeCompare(y.task_date || "")),
                total: ls.reduce((t, l) => t + l.cost, 0),
                unpaid: ls.filter((l) => !l.paid).reduce((t, l) => t + l.cost, 0),
                last: latest(ls),
              }))
              .sort((x, y) => y.last.localeCompare(x.last));
          })();
          return (
            <div key={sub.id} id={`contractor-${sub.id}`} className="rounded-xl border border-[var(--border)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[#f2f0ec] px-4 py-3">
                <div>
                  <div className="font-semibold">
                    {sub.name}
                    {sub.gst_registered && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-normal text-blue-800">
                        GST registered
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {sub.phone || sub.email ? <><PhoneLink phone={sub.phone} />{sub.phone && sub.email ? " · " : ""}{sub.email}</> : "No mobile/email on file"}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-[var(--muted)]">Owed </span>
                    <span className="font-bold text-red-700">{fmtCurrency(owed)}</span>
                  </div>
                  {sub.gst_registered && (
                    <>
                      <div>
                        <span className="text-[var(--muted)]">GST </span>
                        <span className="font-semibold">{fmtCurrency(gst)}</span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)]">Owed + GST </span>
                        <span className="font-bold text-red-700">{fmtCurrency(owedWithGst)}</span>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="text-[var(--muted)]">Paid </span>
                    <span className="font-semibold">{fmtCurrency(paidTotal)}</span>
                  </div>
                  <button
                    onClick={() => exportPdf(cRow)}
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:border-accent"
                  >
                    Download PDF
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-sm">
                  <thead className="text-left text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Work order</th>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">$</th>
                      <th className="px-4 py-2">Note</th>
                      <th className="px-4 py-2">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {woGroups.map((g) => {
                      const first = g.lines[0];
                      const p = first.work_orders?.projects;
                      return (
                        <Fragment key={g.woId}>
                          {g.lines.map((l) => (
                          <tr key={l.id} className="border-t border-[var(--border)]">
                            <td className="px-4 py-2 text-[var(--muted)]">{fmtDate(l.task_date)}</td>
                            <td className="px-4 py-2">
                              {l.work_orders ? (
                                <Link
                                  href={`/dashboard/work-orders/${l.work_order_id}`}
                                  className="text-accent hover:underline"
                                >
                                  {l.work_orders.wo_number}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-2 text-[var(--muted)]">
                              {l.work_orders?.projects
                                ? `Q${l.work_orders.projects.quote_number} — ${l.work_orders.projects.customers?.name || "—"}`
                                : "—"}
                            </td>
                            <td className="px-4 py-2">
                              {l.parts?.name || (l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—")}
                            </td>
                            <td className="px-4 py-2 text-right">{l.qty}</td>
                            <td className="px-4 py-2 text-right font-medium">{fmtCurrency(l.cost)}</td>
                            <td className="px-4 py-2 text-[var(--muted)]">{l.note || "—"}</td>
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={l.paid}
                                disabled={savingId === l.id}
                                onChange={() => togglePaid(l)}
                              />
                            </td>
                          </tr>
                          ))}
                          <tr className="border-t border-[var(--border)] bg-[#f2f0ec] font-semibold">
                            <td className="px-4 py-2" colSpan={5}>
                              {first.work_orders?.wo_number || "Work order"} total
                              <span className="ml-2 font-normal text-[var(--muted)]">
                                {p ? [p.address, p.suburb].filter(Boolean).join(", ") : ""} · {g.lines.length} line{g.lines.length === 1 ? "" : "s"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">{fmtCurrency(g.total)}</td>
                            <td className="px-4 py-2 font-normal text-[var(--muted)]" colSpan={2}>
                              {g.unpaid > 0.005 ? `${fmtCurrency(g.unpaid)} unpaid` : "All paid"}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {contractorRows.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-[var(--muted)]">
            No task lines match these filters.
          </div>
        )}
      </div>

      {unassignedLines.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {unassignedLines.length} task line(s) have no contractor assigned on their work order and aren't shown
          above.
        </div>
      )}
        </>
      )}
    </div>
  );
}
