"use client";
import { quoteLabel } from "@/lib/quoteLabel";

import { PhoneLink } from "../CallLink";
import { Fragment, useEffect, useMemo, useState } from "react";
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
  pay_week?: string | null;
  checked?: boolean | null;
  pay_run_id?: string | null;
  completed?: boolean;
  task_date: string | null;
  note: string | null;
  subcontractor_id: string | null;
  work_orders: {
    wo_number: string;
    contractor_id: string | null;
    archived: boolean;
    completed_date?: string | null;
    projects: {
      quote_number: number;
      revision_letter?: string | null;
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

export type PayRun = {
  id: string;
  pay_date: string;
  status: "Open" | "Paid";
  paid_at: string | null;
  emailed_at: string | null;
  emailed_to: string | null;
};

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

export default function ContractorPaymentsTable({ subs, lines, runs: initialRuns, runsOk }: { subs: Sub[]; lines: Line[]; runs: PayRun[]; runsOk: boolean }) {
  const supabase = createClient();
  // Ticking a line marks it checked (cross-checked against the contractor's invoice). Lines only become paid
  // when the pay run they're in is marked paid.
  const [checkedOverrides, setCheckedOverrides] = useState<Record<string, boolean>>({});
  const [runOverrides, setRunOverrides] = useState<Record<string, string | null>>({});
  const [runs, setRuns] = useState<PayRun[]>(initialRuns);
  const [runBusy, setRunBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [view, setView] = useState<"ready" | "weekly" | "upcoming" | "paid" | "payrun">("ready");
  // Paid jobs report filters (by pay week).
  const [paidFrom, setPaidFrom] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [paidContractor, setPaidContractor] = useState("");
  const [paidSearch, setPaidSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [wkStatus, setWkStatus] = useState<StatusFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("unpaid");
  const [contractorFilter, setContractorFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // The week shown on the Pay week tab; defaults to last week.
  const [weekDay, setWeekDay] = useState(() => addDays(mondayOfDay(new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" })), -7));

  // Remember where this person left off (view, filters, search, week) in this browser.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bb-contractor-payments-state");
      if (raw) {
        const v = JSON.parse(raw);
        if (["ready", "weekly", "upcoming", "paid", "payrun"].includes(v.view)) setView(v.view);
        if (typeof v.paidFrom === "string") setPaidFrom(v.paidFrom);
        if (typeof v.paidTo === "string") setPaidTo(v.paidTo);
        if (typeof v.paidContractor === "string" && (v.paidContractor === "" || subs.some((x) => x.id === v.paidContractor))) setPaidContractor(v.paidContractor);
        if (typeof v.paidSearch === "string") setPaidSearch(v.paidSearch);
        if (typeof v.wkStatus === "string") setWkStatus(v.wkStatus);
        if (typeof v.status === "string") setStatus(v.status);
        if (typeof v.contractorFilter === "string" && (v.contractorFilter === "" || subs.some((x) => x.id === v.contractorFilter))) setContractorFilter(v.contractorFilter);
        if (typeof v.dateFrom === "string") setDateFrom(v.dateFrom);
        if (typeof v.dateTo === "string") setDateTo(v.dateTo);
        if (typeof v.search === "string") setSearch(v.search);
        if (typeof v.weekDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.weekDay)) setWeekDay(v.weekDay);
      }
    } catch {
      /* storage unavailable: use the defaults */
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem("bb-contractor-payments-state", JSON.stringify({ view, wkStatus, status, contractorFilter, dateFrom, dateTo, search, weekDay, paidFrom, paidTo, paidContractor, paidSearch }));
    } catch {
      /* ignore */
    }
  }, [restored, view, wkStatus, status, contractorFilter, dateFrom, dateTo, search, weekDay, paidFrom, paidTo, paidContractor, paidSearch]);

  // A line counts as completed once it is ticked complete on the work order, or the work order itself has a completed date.
  // Only completed work is owed; the rest is a future commitment (Upcoming work).
  const computed = useMemo(() => {
    const base = lines
      .filter((l) => l.work_orders && !l.work_orders.archived)
      .map((l) => {
        const rate = lineRate(l.rate, l.labour_items?.contractor_rate, l.parts?.installer_rate_per_m2);
        const cost = (Number(l.qty) || 0) * rate;
        const contractorId = l.subcontractor_id || l.work_orders?.contractor_id || null;
        const paid = !!l.paid;
        // Paid lines with no pay week recorded (older payments) count as the week the work was done.
        const payWeek = !paid ? null : l.pay_week || (l.task_date ? mondayOfDay(l.task_date) : null);
        const done = !!l.completed || !!l.work_orders?.completed_date;
        const checked = paid || (checkedOverrides[l.id] ?? !!l.checked);
        const runId = l.id in runOverrides ? runOverrides[l.id] : l.pay_run_id ?? null;
        return { ...l, cost, contractorId, paid, payWeek, origPaid: l.paid, done, checked, runId };
      });
    // The date a job was completed: the work order's completed date, else the latest work date of its completed lines.
    const doneByWo = new Map<string, string>();
    for (const l of base) {
      if (!l.done) continue;
      const d = l.work_orders?.completed_date || l.task_date || "";
      if (d > (doneByWo.get(l.work_order_id) ?? "")) doneByWo.set(l.work_order_id, d);
    }
    return base.map((l) => ({ ...l, doneDate: doneByWo.get(l.work_order_id) || null }));
  }, [lines, checkedOverrides, runOverrides]);
  // Whole-job totals (every line, done or not) for the contract total on each work order.
  const woTotals = useMemo(() => {
    const m = new Map<string, { total: number; count: number; done: number }>();
    for (const l of computed) {
      const e = m.get(l.work_order_id) ?? { total: 0, count: 0, done: 0 };
      e.total += l.cost;
      e.count += 1;
      if (l.done) e.done += 1;
      m.set(l.work_order_id, e);
    }
    return m;
  }, [computed]);

  const unassignedLines = computed.filter((l) => !l.contractorId);

  // Apply the status/date/contractor filters once, shared by the summary report,
  // the per-contractor cards and the CSV export.
  const filtered = useMemo(
    () =>
      computed.filter((l) => {
        if (!l.contractorId || !l.done) return false;
        // Membership uses the paid state at load, so a line you tick stays on screen (shown paid) until the page is refreshed.
        if (status === "unpaid" && l.origPaid) return false;
        if (status === "paid" && !l.origPaid) return false;
        if (contractorFilter && l.contractorId !== contractorFilter) return false;
        if (dateFrom && (!l.doneDate || l.doneDate < dateFrom)) return false;
        if (dateTo && (!l.doneDate || l.doneDate > dateTo)) return false;
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

  type CLine = (typeof computed)[number];
  const MIGRATION_MSG = "Pay runs need migration 0103 run in Supabase first (SQL Editor). Nothing was saved.";

  // Tick lines as checked (cross-checked against the contractor's invoice). Paid lines can't be unticked here.
  async function toggleCheckedMany(ls: CLine[], next: boolean) {
    if (!runsOk) return alert(MIGRATION_MSG);
    const targets = ls.filter((l) => !l.paid && l.checked !== next);
    if (targets.length === 0) return;
    const ids = targets.map((l) => l.id);
    setCheckedOverrides((prev) => ({ ...prev, ...Object.fromEntries(ids.map((i) => [i, next])) }));
    if (ids.length === 1) setSavingId(ids[0]);
    const { error } = await supabase.from("work_order_lines").update({ checked: next }).in("id", ids);
    setSavingId(null);
    if (error) {
      setCheckedOverrides((prev) => ({ ...prev, ...Object.fromEntries(targets.map((l) => [l.id, l.checked])) }));
      alert(`Failed to update: ${error.message}`);
    }
  }
  const toggleChecked = (l: CLine) => toggleCheckedMany([l], !l.checked);

  const openRun = runs.find((r) => r.status === "Open") || null;

  async function ensureOpenRun(): Promise<PayRun | null> {
    if (openRun) return openRun;
    const { data, error } = await supabase.from("contractor_pay_runs").insert({ pay_date: todayAU(), status: "Open" }).select("id, pay_date, status, paid_at, emailed_at, emailed_to").single();
    if (error || !data) {
      alert(`Couldn't start a pay run: ${error?.message || "unknown error"}`);
      return null;
    }
    setRuns((prev) => [data as PayRun, ...prev]);
    return data as PayRun;
  }

  // Put a job's completed, unpaid lines into the open pay run (starting one if needed), or take them out.
  async function setInRun(ls: CLine[], add: boolean) {
    if (!runsOk) return alert(MIGRATION_MSG);
    const targets = ls.filter((l) => l.done && !l.paid);
    if (targets.length === 0) return;
    if (add && targets.some((l) => !l.checked) && !confirm("Some lines on this job haven't been ticked as checked yet. Add the job to the pay run anyway?")) return;
    setRunBusy(true);
    const run = add ? await ensureOpenRun() : null;
    if (add && !run) return setRunBusy(false);
    const ids = targets.map((l) => l.id);
    const rid = add ? run!.id : null;
    setRunOverrides((prev) => ({ ...prev, ...Object.fromEntries(ids.map((i) => [i, rid])) }));
    const { error } = await supabase.from("work_order_lines").update({ pay_run_id: rid }).in("id", ids);
    setRunBusy(false);
    if (error) {
      setRunOverrides((prev) => ({ ...prev, ...Object.fromEntries(targets.map((l) => [l.id, l.runId])) }));
      alert(`Failed to update: ${error.message}`);
      return;
    }
    logAudit(supabase, {
      eventType: "update",
      entityType: "work_order_line_payment",
      entityId: ids[0],
      entityLabel: targets[0].work_orders?.wo_number || "Work order",
      details: add ? `Added to pay run ${run!.pay_date}` : "Removed from pay run",
    });
  }

  async function setRunDate(d: string) {
    if (!openRun || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    setRuns((prev) => prev.map((r) => (r.id === openRun.id ? { ...r, pay_date: d } : r)));
    const { error } = await supabase.from("contractor_pay_runs").update({ pay_date: d }).eq("id", openRun.id);
    if (error) alert(`Couldn't save the pay date: ${error.message}`);
  }

  // Mark every line in the open pay run paid, filed under the pay date's week, and close the run.
  async function markRunPaid() {
    if (!openRun) return;
    const ls = computed.filter((l) => l.runId === openRun.id && !l.paid);
    if (ls.length === 0) return alert("There's nothing in this pay run yet.");
    const total = ls.reduce((t, l) => t + l.cost, 0);
    if (!confirm(`Mark this pay run (${fmtDate(openRun.pay_date)}) as paid?\n\n${new Set(ls.map((l) => l.work_order_id)).size} jobs · ${fmtCurrency(total)} ex GST.\n\nThe jobs move to Paid jobs, and anything not in the run stays in Ready to pay.`)) return;
    setRunBusy(true);
    const { error } = await supabase
      .from("work_order_lines")
      .update({ paid: true, checked: true, pay_week: mondayOfDay(openRun.pay_date) })
      .eq("pay_run_id", openRun.id);
    if (!error) {
      const r2 = await supabase.from("contractor_pay_runs").update({ status: "Paid", paid_at: new Date().toISOString() }).eq("id", openRun.id);
      if (r2.error) {
        setRunBusy(false);
        return alert(`Lines were marked paid but the pay run couldn't be closed: ${r2.error.message}`);
      }
    }
    if (error) {
      setRunBusy(false);
      return alert(`Failed to mark paid: ${error.message}`);
    }
    logAudit(supabase, {
      eventType: "update",
      entityType: "contractor_payments",
      entityId: openRun.id,
      entityLabel: `Pay run ${openRun.pay_date}`,
      details: `Pay run marked paid: ${ls.length} lines, ${fmtCurrency(total)} ex GST`,
    });
    window.location.reload();
  }

  // A small button to add a job to / take it out of the open pay run.
  function runButton(ls: CLine[]) {
    const owing = ls.filter((l) => l.done && !l.paid);
    if (owing.length === 0) return <span className="text-xs font-semibold text-green-700">Paid</span>;
    const inRun = owing.every((l) => l.runId && l.runId === openRun?.id);
    const checkedN = owing.filter((l) => l.checked).length;
    return inRun ? (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800">✓ In pay run</span>
        <button type="button" disabled={runBusy} onClick={() => setInRun(owing, false)} className="text-xs text-[var(--muted)] hover:underline disabled:opacity-50">Remove</button>
      </span>
    ) : (
      <button
        type="button"
        disabled={runBusy}
        onClick={() => setInRun(owing, true)}
        title={checkedN < owing.length ? `${checkedN} of ${owing.length} lines checked` : "All lines checked"}
        className={`whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium disabled:opacity-50 ${checkedN < owing.length ? "border-[var(--border)] text-[var(--muted)] hover:border-accent" : "border-accent text-accent hover:bg-accent hover:text-white"}`}
      >
        + Pay run{checkedN < owing.length ? ` (${checkedN}/${owing.length} checked)` : ""}
      </button>
    );
  }

  function lineStatus(l: CLine) {
    if (l.paid) return <span className="text-green-700">✓ Paid{l.payWeek ? ` · wk ${fmtDate(l.payWeek).slice(0, 5)}` : ""}</span>;
    if (l.runId && l.runId === openRun?.id) return <span className="text-green-700">In pay run</span>;
    if (l.checked) return <span className="text-[var(--text)]">Checked</span>;
    return <span className="text-[var(--muted)]">Completed</span>;
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

  // Summary PDF rows for one pay run: each contractor with lines in it, bank details and totals.
  function runPdfRows(runId: string) {
    const map = new Map<string, { jobs: Set<string>; exGst: number }>();
    for (const l of computed) {
      if (!l.contractorId || l.runId !== runId) continue;
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
          id: s.id,
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
  async function downloadRunPdf(run: PayRun) {
    try {
      await downloadWeekSummaryPdf(run.pay_date, runPdfRows(run.id), run.pay_date, { payDate: run.pay_date });
    } catch (e: any) {
      alert(`Couldn't create the PDF: ${e?.message || e}`);
    }
  }

  const ACCOUNTS_EMAIL = "kradford@regencyplaster.com.au";
  const [emailing, setEmailing] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ run: PayRun; pdf: string; url: string; contractors: number; exGst: number } | null>(null);
  // Step 1: build the pay run PDF and show it for checking. Nothing is sent yet.
  async function previewRunPdf(run: PayRun) {
    const rows = runPdfRows(run.id);
    setEmailMsg(null);
    if (rows.length === 0) {
      setEmailMsg("There's nothing in this pay run yet, so there is nothing to send.");
      return;
    }
    try {
      const pdf = await weekSummaryPdfBase64(run.pay_date, rows, run.pay_date, { payDate: run.pay_date });
      const bin = atob(pdf);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setPreview({ run, pdf, url, contractors: rows.length, exGst: rows.reduce((t, r) => t + r.exGst, 0) });
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
        body: JSON.stringify({ weekStart: preview.run.pay_date, weekEnd: preview.run.pay_date, payDate: preview.run.pay_date, to: ACCOUNTS_EMAIL, pdf: preview.pdf, contractors: preview.contractors, exGst: preview.exGst }),
      });
      const j = await res.json().catch(() => ({}));
      setEmailMsg(res.ok ? `Sent to ${ACCOUNTS_EMAIL}.${preview.run.status === "Open" ? " When the payments have gone through, press \"Mark pay run as paid\"." : ""}` : `Not sent: ${j.error || res.status}`);
      if (res.ok) {
        const at = new Date().toISOString();
        const id = preview.run.id;
        setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, emailed_at: at, emailed_to: ACCOUNTS_EMAIL } : r)));
        supabase.from("contractor_pay_runs").update({ emailed_at: at, emailed_to: ACCOUNTS_EMAIL }).eq("id", id).then(() => {});
        closePreview();
      }
    } catch (e: any) {
      setEmailMsg(`Not sent: ${e?.message || e}`);
    }
    setEmailing(false);
  }

  // Pay run tab: the open run's jobs by contractor, and earlier runs.
  const runView = useMemo(() => {
    const byRun = new Map<string, CLine[]>();
    for (const l of computed) if (l.runId && l.contractorId) byRun.set(l.runId, [...(byRun.get(l.runId) ?? []), l]);
    const groupRun = (ls: CLine[]) => {
      const byC = new Map<string, Map<string, CLine[]>>();
      for (const l of ls) {
        const cid = l.contractorId as string;
        const jobs = byC.get(cid) ?? new Map<string, CLine[]>();
        jobs.set(l.work_order_id, [...(jobs.get(l.work_order_id) ?? []), l]);
        byC.set(cid, jobs);
      }
      return subs
        .filter((s) => byC.has(s.id))
        .map((s) => {
          const jobs = Array.from(byC.get(s.id)!.entries()).map(([woId, jl]) => ({ woId, ls: jl, total: jl.reduce((t, l) => t + l.cost, 0), checked: jl.filter((l) => l.checked).length }));
          const total = jobs.reduce((t, j) => t + j.total, 0);
          return { sub: s, jobs, total, gst: s.gst_registered ? total * 0.1 : 0 };
        })
        .sort((a, b) => a.sub.name.localeCompare(b.sub.name));
    };
    const summarise = (run: PayRun) => {
      const ls = byRun.get(run.id) ?? [];
      const rows = groupRun(ls);
      const total = rows.reduce((t, r) => t + r.total, 0);
      const gst = rows.reduce((t, r) => t + r.gst, 0);
      return { run, rows, total, gst, jobs: new Set(ls.map((l) => l.work_order_id)).size };
    };
    return {
      open: openRun ? summarise(openRun) : null,
      past: runs.filter((r) => r.status === "Paid").sort((a, b) => b.pay_date.localeCompare(a.pay_date)).map(summarise),
    };
  }, [computed, runs, openRun, subs]);

  // ---- Weekly tab: Monday to Sunday by work date, a total per job and per contractor ----
  const wkStart = mondayOfDay(weekDay);
  const wkEnd = addDays(wkStart, 6);
  // Which section of the Pay week tab a line belongs in (null = not shown this week).
  //  "carried": completed before this week and still unpaid, or paid in this pay week (so a line you tick stays put).
  //  "week":    completed this week, or ticked paid in this pay week whenever the work was done.
  function weekSection(l: (typeof computed)[number]): "carried" | "week" | null {
    if (!l.contractorId) return null;
    const paidHere = l.paid && l.payWeek === wkStart;
    if (l.done && l.doneDate && l.doneDate < wkStart) return !l.paid || paidHere ? "carried" : null;
    if (l.done && l.doneDate && l.doneDate <= wkEnd) return "week";
    return paidHere ? "week" : null;
  }
  function buildWeekRows(section: "carried" | "week") {
    const byC = new Map<string, Map<string, typeof computed>>();
    for (const l of computed) {
      if (weekSection(l) !== section) continue;
      if (wkStatus === "unpaid" && l.paid) continue;
      if (wkStatus === "paid" && !l.paid) continue;
      const cid = l.contractorId as string;
      const jobs = byC.get(cid) ?? new Map<string, typeof computed>();
      jobs.set(l.work_order_id, [...(jobs.get(l.work_order_id) ?? []), l]);
      byC.set(cid, jobs);
    }
    return subs
      .filter((s) => byC.has(s.id))
      .map((s) => {
        const jobs = Array.from(byC.get(s.id)!.entries())
          .map(([woId, ls]) => ({
            woId,
            first: ls[0],
            ls: [...ls].sort((x, y) => (x.task_date || "").localeCompare(y.task_date || "")),
            lines: ls.length,
            total: ls.reduce((t, l) => t + l.cost, 0),
            unpaid: ls.filter((l) => !l.paid).reduce((t, l) => t + l.cost, 0),
            doneDate: ls[0].doneDate,
            days: Array.from(new Set<string>(ls.map((l) => (l.task_date || l.doneDate || "") as string))).sort(),
          }))
          .sort((a, b) => (section === "carried" ? (a.doneDate || "").localeCompare(b.doneDate || "") : (a.days[0] || "").localeCompare(b.days[0] || "")));
        const total = jobs.reduce((t, j) => t + j.total, 0);
        const unpaid = jobs.reduce((t, j) => t + j.unpaid, 0);
        const gst = s.gst_registered ? total * 0.1 : 0;
        return { sub: s, jobs, total, unpaid, gst };
      })
      .sort((a, b) => b.total - a.total);
  }
  const weekRows = useMemo(() => buildWeekRows("week"), [computed, subs, wkStart, wkEnd, wkStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  const carriedRows = useMemo(() => buildWeekRows("carried"), [computed, subs, wkStart, wkEnd, wkStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekTotal = weekRows.reduce((t, r) => t + r.total, 0);
  const weekGst = weekRows.reduce((t, r) => t + r.gst, 0);
  const carriedTotal = carriedRows.reduce((t, r) => t + r.total, 0);
  const carriedUnpaid = carriedRows.reduce((t, r) => t + r.unpaid, 0);
  const weekUnpaid = weekRows.reduce((t, r) => t + r.unpaid, 0) + carriedUnpaid;
  const weekJobs = weekRows.reduce((t, r) => t + r.jobs.length, 0);
  const carriedJobs = carriedRows.reduce((t, r) => t + r.jobs.length, 0);

  // Upcoming work: allocated to a contractor but not completed yet. A forecast of what will become owed.
  const upcoming = useMemo(() => {
    const byC = new Map<string, Map<string, typeof computed>>();
    for (const l of computed) {
      if (!l.contractorId || l.done) continue;
      if (contractorFilter && l.contractorId !== contractorFilter) continue;
      const jobs = byC.get(l.contractorId) ?? new Map<string, typeof computed>();
      jobs.set(l.work_order_id, [...(jobs.get(l.work_order_id) ?? []), l]);
      byC.set(l.contractorId, jobs);
    }
    const thisMon = mondayOfDay(todayAU());
    const nextMon = addDays(thisMon, 7);
    const afterNext = addDays(thisMon, 14);
    let thisWeek = 0, nextWeek = 0, later = 0, thisJobs = 0, nextJobs = 0, laterJobs = 0;
    const rows = subs
      .filter((s) => byC.has(s.id))
      .map((s) => {
        const jobs = Array.from(byC.get(s.id)!.entries())
          .map(([woId, ls]) => {
            const dates = ls.map((l) => l.task_date).filter(Boolean).sort() as string[];
            const first = dates[0] || null;
            const last = dates[dates.length - 1] || null;
            const value = ls.reduce((t, l) => t + l.cost, 0);
            const tot = woTotals.get(woId);
            const started = (tot?.done ?? 0) > 0;
            if (first && first < nextMon) { thisWeek += value; thisJobs++; }
            else if (first && first < afterNext) { nextWeek += value; nextJobs++; }
            else { later += value; laterJobs++; }
            return { woId, ls, first, last, value, started, doneCount: tot?.done ?? 0, count: tot?.count ?? ls.length };
          })
          .sort((a, b) => (a.first || "9999").localeCompare(b.first || "9999"));
        return { sub: s, jobs, total: jobs.reduce((t, j) => t + j.value, 0) };
      })
      .sort((a, b) => b.total - a.total);
    const total = rows.reduce((t, r) => t + r.total, 0);
    return { rows, total, thisWeek, nextWeek, later, thisJobs, nextJobs, laterJobs, jobCount: rows.reduce((t, r) => t + r.jobs.length, 0) };
  }, [computed, subs, woTotals, contractorFilter]);
  const notCountedThisWeek = useMemo(() => {
    const jobs = new Set<string>();
    let total = 0;
    for (const l of computed) {
      if (!l.contractorId || l.done || !l.task_date || l.task_date < wkStart || l.task_date > wkEnd) continue;
      jobs.add(l.work_order_id);
      total += l.cost;
    }
    return { jobs: jobs.size, total };
  }, [computed, wkStart, wkEnd]);

  // ---- Paid jobs report: every work order with lines ticked paid, grouped by pay week (newest first) ----
  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
  const paidReport = useMemo(() => {
    // Pay week filters snap to the Monday of the chosen dates.
    const from = paidFrom ? mondayOfDay(paidFrom) : "";
    const to = paidTo ? mondayOfDay(paidTo) : "";
    const q = paidSearch.trim().toLowerCase();
    const jobs = new Map<string, { key: string; woId: string; week: string; contractorId: string; ls: typeof computed }>();
    for (const l of computed) {
      if (!l.contractorId || !l.paid) continue;
      const week = l.payWeek || "";
      if (from && (!week || week < from)) continue;
      if (to && (!week || week > to)) continue;
      if (paidContractor && l.contractorId !== paidContractor) continue;
      if (q) {
        const p = l.work_orders?.projects;
        const hay = [l.work_orders?.wo_number, p ? quoteLabel(p as any) : "", p?.customers?.name, p?.address, p?.suburb, subById.get(l.contractorId)?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }
      // One row per work order, contractor and pay week (a job paid across two weeks shows in both).
      const key = `${week}|${l.work_order_id}|${l.contractorId}`;
      const e = jobs.get(key) ?? { key, woId: l.work_order_id, week, contractorId: l.contractorId, ls: [] as typeof computed };
      e.ls.push(l);
      jobs.set(key, e);
    }
    const rows = Array.from(jobs.values()).map((j) => {
      const sub = subById.get(j.contractorId);
      const exGst = j.ls.reduce((t, l) => t + l.cost, 0);
      const gst = sub?.gst_registered ? exGst * 0.1 : 0;
      // Anything on the same work order (this contractor) not yet paid.
      const notPaid = computed
        .filter((l) => l.work_order_id === j.woId && l.contractorId === j.contractorId && !l.paid)
        .reduce((t, l) => t + l.cost, 0);
      return { ...j, sub, exGst, gst, notPaid, doneDate: j.ls[0].doneDate, ls: [...j.ls].sort((a, b) => (a.task_date || "").localeCompare(b.task_date || "")) };
    });
    const weeks = new Map<string, typeof rows>();
    for (const r of rows) weeks.set(r.week, [...(weeks.get(r.week) ?? []), r]);
    const groups = Array.from(weeks.entries())
      .map(([week, rs]) => ({
        week,
        rows: rs.sort((a, b) => (a.sub?.name || "").localeCompare(b.sub?.name || "") || (a.ls[0].work_orders?.wo_number || "").localeCompare(b.ls[0].work_orders?.wo_number || "")),
        exGst: rs.reduce((t, r) => t + r.exGst, 0),
        gst: rs.reduce((t, r) => t + r.gst, 0),
      }))
      .sort((a, b) => (b.week || "").localeCompare(a.week || ""));
    const exGst = rows.reduce((t, r) => t + r.exGst, 0);
    const gst = rows.reduce((t, r) => t + r.gst, 0);
    return {
      groups,
      rows,
      exGst,
      gst,
      jobs: new Set(rows.map((r) => r.woId)).size,
      contractors: new Set(rows.map((r) => r.contractorId)).size,
    };
  }, [computed, subById, paidFrom, paidTo, paidContractor, paidSearch]);

  function exportPaidCsv() {
    const header = ["Pay week (Mon)", "Contractor", "GST registered", "Work order", "Quote / customer", "Site", "Completed", "Lines paid", "Paid ex GST", "GST", "Paid inc GST", "Still unpaid on job"];
    const out: string[] = [header.join(",")];
    for (const g of paidReport.groups) {
      for (const r of g.rows) {
        const p = r.ls[0].work_orders?.projects;
        out.push(
          [
            csvCell(r.week ? fmtDate(r.week) : "Not recorded"),
            csvCell(r.sub?.name || "—"),
            csvCell(r.sub?.gst_registered ? "Yes" : "No"),
            csvCell(r.ls[0].work_orders?.wo_number || "—"),
            csvCell(p ? `${quoteLabel(p as any)} — ${p.customers?.name || "—"}` : "—"),
            csvCell(p ? [p.address, p.suburb].filter(Boolean).join(", ") : ""),
            csvCell(fmtDate(r.doneDate)),
            csvCell(r.ls.length),
            csvCell(r.exGst.toFixed(2)),
            csvCell(r.gst.toFixed(2)),
            csvCell((r.exGst + r.gst).toFixed(2)),
            csvCell(r.notPaid.toFixed(2)),
          ].join(",")
        );
      }
    }
    const blob = new Blob([out.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contractor-paid-jobs-${todayAU()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
                ? `${quoteLabel(l.work_orders.projects)} — ${l.work_orders.projects.customers?.name || "—"}`
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

  type WeekRow = ReturnType<typeof buildWeekRows>[number];
  function weekCard({ sub, jobs, total, unpaid, gst }: WeekRow, carried: boolean) {
    return (
              <div key={sub.id} className={`rounded-xl border ${carried ? "border-red-300" : "border-[var(--border)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[#f2f0ec] px-4 py-3">
                  <div className="font-semibold">
                    {sub.name}
                    {sub.gst_registered && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-normal text-blue-800">GST registered</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div><span className="text-[var(--muted)]">{carried ? "Carried over " : "Week "}</span><span className="font-bold">{fmtCurrency(total)}</span></div>
                    {sub.gst_registered && <div><span className="text-[var(--muted)]">+ GST </span><span className="font-semibold">{fmtCurrency(total + gst)}</span></div>}
                    <div><span className="text-[var(--muted)]">Unpaid </span><span className={`font-semibold ${unpaid > 0.005 ? "text-red-700" : ""}`}>{fmtCurrency(unpaid)}</span></div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-sm">
                    <thead className="text-left text-xs uppercase text-[var(--muted)]">
                      <tr>
                        <th className="w-10 px-4 py-2"></th>
                        <th className="px-4 py-2">Work order</th>
                        <th className="px-4 py-2">Customer / site</th>
                        <th className="px-4 py-2">{carried ? "Completed" : "Work dates"}</th>
                        <th className="px-4 py-2 text-right">Lines</th>
                        <th className="px-4 py-2 text-right">Job total</th>
                        <th className="px-4 py-2 text-right">Unpaid</th>
                        <th className="px-4 py-2 text-right">Pay run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((j) => {
                        const p = j.first.work_orders?.projects;
                        const isOpen = open.has(j.woId);
                        const allChecked = j.ls.every((l) => l.checked);
                        const someChecked = j.ls.some((l) => l.checked);
                        const contract = woTotals.get(j.woId)?.total ?? j.total;
                        return (
                          <Fragment key={j.woId}>
                            <tr className="border-t border-[var(--border)] bg-[#f7f6f3]">
                              <td className="px-4 py-2">
                                <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={() => toggleCheckedMany(j.ls, !allChecked)} title="Tick every line on this job as checked" />
                              </td>
                              <td className="px-4 py-2">
                                <button type="button" className="mr-1 text-[var(--muted)]" onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(j.woId)) n.delete(j.woId); else n.add(j.woId); return n; })} aria-label={isOpen ? "Collapse" : "Expand"}>{isOpen ? "▾" : "▸"}</button>
                                <Link href={`/dashboard/work-orders/${j.woId}`} className="text-accent hover:underline">{j.first.work_orders?.wo_number || "—"}</Link>
                              </td>
                              <td className="px-4 py-2 text-[var(--muted)]">
                                {p ? `${quoteLabel(p as any)} — ${p.customers?.name || "—"}` : "—"}
                                {p && [p.address, p.suburb].filter(Boolean).length > 0 && <div className="text-xs">{[p.address, p.suburb].filter(Boolean).join(", ")}</div>}
                              </td>
                              <td className="px-4 py-2 text-[var(--muted)]">
                                {carried ? (
                                  <>
                                    {fmtDate(j.doneDate)}
                                    {j.unpaid > 0.005 && j.doneDate && (() => {
                                      const waiting = Math.max(0, Math.round((new Date(todayAU() + "T00:00:00").getTime() - new Date(j.doneDate + "T00:00:00").getTime()) / 86400000));
                                      return <span className={`ml-2 ${waiting >= 14 ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800" : "text-xs"}`}>{waiting} day{waiting === 1 ? "" : "s"} waiting</span>;
                                    })()}
                                  </>
                                ) : (
                                  j.days.filter(Boolean).map((d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })).join(", ")
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-[var(--muted)]">{j.lines}</td>
                              <td className="px-4 py-2 text-right font-medium">{fmtCurrency(contract)}</td>
                              <td className={`px-4 py-2 text-right ${j.unpaid > 0.005 ? "text-red-700" : "text-[var(--muted)]"}`}>{j.unpaid > 0.005 ? fmtCurrency(j.unpaid) : "Paid"}</td>
                              <td className="px-4 py-2 text-right">{runButton(j.ls)}</td>
                            </tr>
                            {isOpen && j.ls.map((l) => {
                              const rate = lineRate(l.rate, l.labour_items?.contractor_rate, l.parts?.installer_rate_per_m2);
                              return (
                                <tr key={l.id} className="border-t border-[var(--border)] text-xs">
                                  <td className="px-4 py-1.5"><input type="checkbox" checked={l.checked} disabled={l.paid || savingId === l.id} onChange={() => toggleChecked(l)} title={l.paid ? "Paid" : "Checked"} /></td>
                                  <td className="px-4 py-1.5 text-[var(--muted)]" colSpan={2}>
                                    <span className="text-sm text-[var(--text)]">{l.parts?.name || (l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—")}</span>
                                    {l.note && <div>{l.note}</div>}
                                  </td>
                                  <td className="px-4 py-1.5 text-[var(--muted)]">{fmtDate(l.task_date)} · qty {l.qty} × {fmtCurrency(rate)}</td>
                                  <td className="px-4 py-1.5"></td>
                                  <td className="px-4 py-1.5 text-right text-sm font-medium">{fmtCurrency(l.cost)}</td>
                                  <td className="px-4 py-1.5 text-right font-semibold" colSpan={2}>{lineStatus(l)}</td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                      <tr className="border-t border-[var(--border)] bg-[#f2f0ec] font-semibold">
                        <td className="px-4 py-2" colSpan={5}>{sub.name} {carried ? "carried over" : "week"} total</td>
                        <td className="px-4 py-2 text-right">{fmtCurrency(total)}</td>
                        <td className="px-4 py-2 text-right">{unpaid > 0.005 ? fmtCurrency(unpaid) : "Paid"}</td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{view === "paid" ? <><span className="print:hidden">Contractor Payments</span><span className="hidden print:inline">Contractor paid jobs</span></> : "Contractor Payments"}</h1>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" onClick={() => setView("payrun")} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            Pay run{runView.open ? ` · ${runView.open.jobs} job${runView.open.jobs === 1 ? "" : "s"} · ${fmtCurrency(runView.open.total)}` : ""}
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
                <div className="text-lg font-semibold">Preview: contractor pay run {fmtDate(preview.run.pay_date)}</div>
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
            <iframe src={preview.url} title="Pay run summary preview" className="mt-3 w-full flex-1 rounded-lg border border-[var(--border)] bg-white" />
          </div>
        </div>
      )}

      {!runsOk && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          Pay runs aren&apos;t set up in the database yet. Run migration <b>0103_contractor_pay_runs.sql</b> in Supabase → SQL Editor, then reload this page.
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        {([["ready", `Ready to pay (${new Set(computed.filter((l) => l.contractorId && l.done && !l.paid).map((l) => l.work_order_id)).size} jobs)`], ["weekly", "Pay week (Mon–Sun)"], ["payrun", `Pay run (${runView.open ? fmtCurrency(runView.open.total) : "empty"})`], ["upcoming", `Upcoming work (${fmtCurrency(upcoming.total)})`], ["paid", "Paid jobs"]] as const).map(([k, l]) => (
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
            <button type="button" onClick={() => setOpen(new Set([...weekRows, ...carriedRows].flatMap((r) => r.jobs.map((j) => j.woId))))} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">Expand all</button>
            <button type="button" onClick={() => setOpen(new Set())} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">Collapse all</button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">This week (ex GST)</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(weekTotal)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{weekJobs} job{weekJobs === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">GST (this week)</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(weekGst)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">GST-registered contractors</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Carried over</div>
              <div className={`mt-1 text-2xl font-bold ${carriedUnpaid > 0.005 ? "text-red-700" : ""}`}>{fmtCurrency(carriedTotal)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{carriedJobs} job{carriedJobs === 1 ? "" : "s"} from earlier weeks</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Still unpaid</div>
              <div className="mt-1 text-2xl font-bold text-red-700">{fmtCurrency(weekUnpaid)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">Both sections</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Paid in this pay week</div>
              <div className="mt-1 text-2xl font-bold text-green-700">{fmtCurrency(computed.filter((l) => l.contractorId && l.paid && l.payWeek === wkStart).reduce((t, l) => t + l.cost, 0))}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">Goes in the weekly summary PDF</div>
            </div>
          </div>

          {notCountedThisWeek.jobs > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm" style={{ background: "#3a3112", borderColor: "#5b4b14", color: "#fde68a" }}>
              <span><b>Not counted yet:</b> {fmtCurrency(notCountedThisWeek.total)} of work is allocated to contractors this week but not completed ({notCountedThisWeek.jobs} job{notCountedThisWeek.jobs === 1 ? "" : "s"}).</span>
              <button type="button" onClick={() => setView("upcoming")} className="rounded-lg border px-3 py-1 text-xs font-medium" style={{ borderColor: "#f5b82e" }}>View in Upcoming work →</button>
            </div>
          )}
          <div className="mt-5 flex flex-col gap-5">
            {carriedRows.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold">Carried over from earlier weeks</h2>
                <p className="text-xs text-[var(--muted)]">Completed before {fmtDate(wkStart)} and not paid yet. Ticking a line here files it under this pay week ({fmtDate(wkStart)} – {fmtDate(wkEnd)}).</p>
              </div>
            )}
            {carriedRows.map((row) => weekCard(row, true))}
            <div className={carriedRows.length > 0 ? "mt-2" : ""}>
              <h2 className="text-lg font-semibold">This pay week</h2>
              <p className="text-xs text-[var(--muted)]">Jobs completed {fmtDate(wkStart)} – {fmtDate(wkEnd)}, plus anything ticked paid in this pay week.</p>
            </div>
            {weekRows.length === 0 && (
              <div className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-[var(--muted)]">No work completed in this week.</div>
            )}
            {weekRows.map((row) => weekCard(row, false))}
          </div>
        </div>
      )}

      {view === "ready" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Completed &amp; owed (ex GST)</div>
              <div className="mt-1 text-2xl font-bold text-red-700">{fmtCurrency(grandOwed)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{summaryRows.length} contractor{summaryRows.length === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">GST on owed</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(grandGst)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">GST-registered contractors only</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Paid (shown)</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(grandPaid)}</div>
            </div>
            <button type="button" onClick={() => setView("upcoming")} className="rounded-xl border border-[var(--border)] p-4 text-left hover:border-accent">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Upcoming (not completed)</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(upcoming.total)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">Not owed yet — see Upcoming work</div>
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-4 rounded-xl border border-[var(--border)] bg-[#f2f0ec] p-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Completed from
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Completed to
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]">
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Contractor
              <select value={contractorFilter} onChange={(e) => setContractorFilter(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]">
                <option value="">All contractors</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Search
              <input placeholder="Filter by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]" />
            </label>
            {(dateFrom || dateTo || contractorFilter || search || status !== "unpaid") && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); setContractorFilter(""); setSearch(""); setStatus("unpaid"); }} className="text-sm text-[var(--muted)] hover:underline">
                Reset filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setOpen(new Set(contractorRows.flatMap((r) => r.lines.map((l) => l.work_order_id))))} className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:border-accent">Expand all</button>
              <button type="button" onClick={() => setOpen(new Set())} className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:border-accent">Collapse all</button>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Shows every completed job that hasn&apos;t been paid, however long ago it finished. Open a work order and tick each line as you check it against the contractor&apos;s invoice, then press <b>+ Pay run</b> when you&apos;re paying that job. Jobs become paid when the pay run is marked paid.
          </p>

          <div className="mt-4 flex flex-col gap-5">
            {contractorRows.map((cRow) => {
              const { sub, lines: subLines, owed, paidTotal, gst, owedWithGst } = cRow;
              const woGroups = (() => {
                const m = new Map<string, typeof subLines>();
                for (const l of subLines) m.set(l.work_order_id, [...(m.get(l.work_order_id) ?? []), l]);
                return Array.from(m.entries())
                  .map(([woId, ls]) => ({
                    woId,
                    lines: [...ls].sort((x, y) => (x.task_date || "").localeCompare(y.task_date || "")),
                    owed: ls.filter((l) => !l.paid).reduce((t, l) => t + l.cost, 0),
                    doneDate: ls[0].doneDate,
                  }))
                  .sort((x, y) => (x.doneDate || "").localeCompare(y.doneDate || ""));
              })();
              return (
                <div key={sub.id} id={`contractor-${sub.id}`} className="rounded-xl border border-[var(--border)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[#f2f0ec] px-4 py-3">
                    <div>
                      <div className="font-semibold">
                        {sub.name}
                        {sub.gst_registered && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-normal text-blue-800">GST registered</span>}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {sub.phone || sub.email ? <><PhoneLink phone={sub.phone} />{sub.phone && sub.email ? " · " : ""}{sub.email}</> : "No mobile/email on file"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div><span className="text-[var(--muted)]">Owed </span><span className="font-bold text-red-700">{fmtCurrency(owed)}</span></div>
                      {sub.gst_registered && (
                        <>
                          <div><span className="text-[var(--muted)]">GST </span><span className="font-semibold">{fmtCurrency(gst)}</span></div>
                          <div><span className="text-[var(--muted)]">Owed + GST </span><span className="font-bold text-red-700">{fmtCurrency(owedWithGst)}</span></div>
                        </>
                      )}
                      <div><span className="text-[var(--muted)]">Paid </span><span className="font-semibold">{fmtCurrency(paidTotal)}</span></div>
                      <button onClick={() => exportPdf(cRow)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:border-accent">Download PDF</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-sm">
                      <thead className="text-left text-xs uppercase text-[var(--muted)]">
                        <tr>
                          <th className="w-10 px-4 py-2" title="Tick the whole job as checked"></th>
                          <th className="px-4 py-2">Work order</th>
                          <th className="px-4 py-2">Customer / site</th>
                          <th className="px-4 py-2">Completed</th>
                          <th className="px-4 py-2">Waiting</th>
                          <th className="px-4 py-2 text-right">Lines done</th>
                          <th className="px-4 py-2 text-right">Contract total</th>
                          <th className="px-4 py-2 text-right">Owed (ex GST)</th>
                          <th className="px-4 py-2 text-right">Pay run</th>
                        </tr>
                      </thead>
                      <tbody>
                        {woGroups.map((g) => {
                          const first = g.lines[0];
                          const p = first.work_orders?.projects;
                          const tot = woTotals.get(g.woId);
                          const isOpen = open.has(g.woId);
                          const allPaid = g.lines.every((l) => l.paid);
                          const allChecked = g.lines.every((l) => l.checked);
                          const someChecked = g.lines.some((l) => l.checked);
                          const waiting = g.doneDate ? Math.max(0, Math.round((new Date(todayAU() + "T00:00:00").getTime() - new Date(g.doneDate + "T00:00:00").getTime()) / 86400000)) : null;
                          // Not-done lines of the same job, shown greyed (not owed yet).
                          const pending = computed.filter((l) => l.work_order_id === g.woId && !l.done && (l.subcontractor_id || l.work_orders?.contractor_id) === sub.id);
                          return (
                            <Fragment key={g.woId}>
                              <tr className="border-t border-[var(--border)] bg-[#f7f6f3]">
                                <td className="px-4 py-2">
                                  <input
                                    type="checkbox"
                                    checked={allChecked}
                                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                                    onChange={() => toggleCheckedMany(g.lines, !allChecked)}
                                    title="Tick every completed line on this job as checked"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <button type="button" className="mr-1 text-[var(--muted)]" onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(g.woId)) n.delete(g.woId); else n.add(g.woId); return n; })} aria-label={isOpen ? "Collapse" : "Expand"}>
                                    {isOpen ? "▾" : "▸"}
                                  </button>
                                  <Link href={`/dashboard/work-orders/${g.woId}`} className="text-accent hover:underline">{first.work_orders?.wo_number || "—"}</Link>
                                </td>
                                <td className="px-4 py-2">
                                  {p ? `${quoteLabel(p as any)} — ${p.customers?.name || "—"}` : "—"}
                                  {p && [p.address, p.suburb].filter(Boolean).length > 0 && <div className="text-xs text-[var(--muted)]">{[p.address, p.suburb].filter(Boolean).join(", ")}</div>}
                                </td>
                                <td className="px-4 py-2 text-[var(--muted)]">{fmtDate(g.doneDate)}</td>
                                <td className="px-4 py-2">
                                  {allPaid ? <span className="text-green-700">Paid</span> : waiting === null ? "—" : <span className={waiting >= 14 ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800" : "text-[var(--muted)]"}>{waiting} day{waiting === 1 ? "" : "s"}</span>}
                                </td>
                                <td className="px-4 py-2 text-right text-[var(--muted)]">{tot ? `${tot.done} / ${tot.count}` : g.lines.length}</td>
                                <td className="px-4 py-2 text-right">{fmtCurrency(tot?.total ?? g.lines.reduce((t, l) => t + l.cost, 0))}</td>
                                <td className={`px-4 py-2 text-right font-semibold ${g.owed > 0.005 ? "text-red-700" : "text-green-700"}`}>{g.owed > 0.005 ? fmtCurrency(g.owed) : "Paid"}</td>
                                <td className="px-4 py-2 text-right">{runButton(g.lines)}</td>
                              </tr>
                              {isOpen && (
                                <>
                                  <tr className="border-t border-[var(--border)] text-left text-[11px] uppercase text-[var(--muted)]">
                                    <th className="px-4 py-1.5 font-semibold">Checked</th>
                                    <th className="px-4 py-1.5 font-semibold" colSpan={2}>Item</th>
                                    <th className="px-4 py-1.5 font-semibold">Work date</th>
                                    <th className="px-4 py-1.5 text-right font-semibold">Qty</th>
                                    <th className="px-4 py-1.5 text-right font-semibold">Rate</th>
                                    <th className="px-4 py-1.5 text-right font-semibold">Line amount</th>
                                    <th className="px-4 py-1.5 text-right font-semibold" colSpan={2}>Status</th>
                                  </tr>
                                  {g.lines.map((l) => {
                                    const rate = lineRate(l.rate, l.labour_items?.contractor_rate, l.parts?.installer_rate_per_m2);
                                    return (
                                      <tr key={l.id} className="border-t border-[var(--border)]">
                                        <td className="px-4 py-1.5">
                                          <input type="checkbox" checked={l.checked} disabled={l.paid || savingId === l.id} onChange={() => toggleChecked(l)} title={l.paid ? "Paid" : "Checked"} />
                                        </td>
                                        <td className="px-4 py-1.5" colSpan={2}>
                                          {l.parts?.name || (l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—")}
                                          {l.note && <div className="text-xs text-[var(--muted)]">{l.note}</div>}
                                        </td>
                                        <td className="px-4 py-1.5 text-[var(--muted)]">{fmtDate(l.task_date)}</td>
                                        <td className="px-4 py-1.5 text-right">{l.qty}</td>
                                        <td className="px-4 py-1.5 text-right text-[var(--muted)]">{fmtCurrency(rate)}</td>
                                        <td className="px-4 py-1.5 text-right font-medium">{fmtCurrency(l.cost)}</td>
                                        <td className="px-4 py-1.5 text-right text-xs font-semibold" colSpan={2}>{lineStatus(l)}</td>
                                      </tr>
                                    );
                                  })}
                                  {pending.map((l) => {
                                    const rate = lineRate(l.rate, l.labour_items?.contractor_rate, l.parts?.installer_rate_per_m2);
                                    return (
                                      <tr key={l.id} className="border-t border-[var(--border)] text-[var(--muted)] opacity-70">
                                        <td className="px-4 py-1.5"></td>
                                        <td className="px-4 py-1.5" colSpan={2}>{l.parts?.name || (l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—")}</td>
                                        <td className="px-4 py-1.5">{fmtDate(l.task_date)}</td>
                                        <td className="px-4 py-1.5 text-right">{l.qty}</td>
                                        <td className="px-4 py-1.5 text-right">{fmtCurrency(rate)}</td>
                                        <td className="px-4 py-1.5 text-right">{fmtCurrency(l.cost)}</td>
                                        <td className="px-4 py-1.5 text-right text-xs" colSpan={2}>Not done</td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="border-t border-[var(--border)] bg-[#f2f0ec] text-sm">
                                    <td className="px-4 py-2" colSpan={6}>
                                      <span className="text-[var(--muted)]">
                                        {first.work_orders?.wo_number} · contract total {fmtCurrency(tot?.total ?? 0)} · checked {fmtCurrency(g.lines.filter((l) => l.checked).reduce((t, l) => t + l.cost, 0))} · paid {fmtCurrency(g.lines.filter((l) => l.paid).reduce((t, l) => t + l.cost, 0))}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right font-semibold" colSpan={3}>{g.owed > 0.005 ? `${fmtCurrency(g.owed)} still owed` : "All paid"}</td>
                                  </tr>
                                </>
                              )}
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
                No completed work matches these filters.
              </div>
            )}
          </div>

          {unassignedLines.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {unassignedLines.length} task line(s) have no contractor assigned on their work order and aren&apos;t shown above.
            </div>
          )}
        </>
      )}

      {view === "payrun" && (
        <div className="mt-4">
          {!runView.open || runView.open.rows.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-[var(--muted)]">
              The pay run is empty. On <button type="button" onClick={() => setView("ready")} className="text-accent hover:underline">Ready to pay</button>, tick each job&apos;s lines as you check them, then press <b>+ Pay run</b> on the jobs you&apos;re paying.
              {runView.open && (
                <div className="mt-3 text-xs">
                  Pay date{" "}
                  <input type="date" value={runView.open.run.pay_date} onChange={(e) => setRunDate(e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm text-[var(--text)]" />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4 rounded-xl border border-[var(--border)] bg-[#f2f0ec] p-4">
                <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
                  Pay date
                  <input type="date" value={runView.open.run.pay_date} onChange={(e) => setRunDate(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]" />
                </label>
                <div className="text-sm">
                  <div><b>{runView.open.rows.length}</b> contractor{runView.open.rows.length === 1 ? "" : "s"} · <b>{runView.open.jobs}</b> job{runView.open.jobs === 1 ? "" : "s"}</div>
                  <div>
                    <b>{fmtCurrency(runView.open.total)}</b> ex GST · <b>{fmtCurrency(runView.open.total + runView.open.gst)}</b> inc GST
                  </div>
                  {runView.open.run.emailed_at && <div className="text-xs text-green-700">Emailed to accounts {new Date(runView.open.run.emailed_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}</div>}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => downloadRunPdf(runView.open!.run)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:border-accent">Summary PDF</button>
                  <button type="button" onClick={() => previewRunPdf(runView.open!.run)} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:border-accent">Preview &amp; email to accounts</button>
                  <button type="button" disabled={runBusy} onClick={markRunPaid} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Mark pay run as paid</button>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Only the jobs listed here go in the summary PDF, whatever dates the work was done. Anything you don&apos;t add stays in Ready to pay for a later run.
              </p>
              <div className="mt-4 flex flex-col gap-5">
                {runView.open.rows.map(({ sub, jobs, total, gst }) => {
                  const noBank = !sub.bank_bsb && !sub.bank_account_number;
                  return (
                    <div key={sub.id} className="rounded-xl border border-[var(--border)]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[#f2f0ec] px-4 py-3">
                        <div>
                          <div className="font-semibold">
                            {sub.name}
                            {sub.gst_registered && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-normal text-blue-800">GST registered</span>}
                          </div>
                          <div className={`text-xs ${noBank ? "font-semibold text-red-700" : "text-[var(--muted)]"}`}>
                            {noBank ? "No bank details on file" : `${sub.bank_account_name || ""} · BSB ${sub.bank_bsb || "—"} · Acc ${sub.bank_account_number || "—"}`}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <div><span className="text-[var(--muted)]">Ex GST </span><span className="font-bold">{fmtCurrency(total)}</span></div>
                          <div><span className="text-[var(--muted)]">Inc GST </span><span className="font-bold">{fmtCurrency(total + gst)}</span></div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full whitespace-nowrap text-sm">
                          <thead className="text-left text-xs uppercase text-[var(--muted)]">
                            <tr>
                              <th className="px-4 py-2">Work order</th>
                              <th className="px-4 py-2">Customer / site</th>
                              <th className="px-4 py-2">Completed</th>
                              <th className="px-4 py-2 text-right">Lines checked</th>
                              <th className="px-4 py-2 text-right">Amount (ex GST)</th>
                              <th className="px-4 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {jobs.map((j) => {
                              const p = j.ls[0].work_orders?.projects;
                              return (
                                <tr key={j.woId} className="border-t border-[var(--border)]">
                                  <td className="px-4 py-2"><Link href={`/dashboard/work-orders/${j.woId}`} className="text-accent hover:underline">{j.ls[0].work_orders?.wo_number || "—"}</Link></td>
                                  <td className="px-4 py-2">
                                    {p ? `${quoteLabel(p as any)} — ${p.customers?.name || "—"}` : "—"}
                                    {p && [p.address, p.suburb].filter(Boolean).length > 0 && <div className="text-xs text-[var(--muted)]">{[p.address, p.suburb].filter(Boolean).join(", ")}</div>}
                                  </td>
                                  <td className="px-4 py-2 text-[var(--muted)]">{fmtDate(j.ls[0].doneDate)}</td>
                                  <td className={`px-4 py-2 text-right ${j.checked < j.ls.length ? "font-semibold text-amber-700" : "text-[var(--muted)]"}`}>{j.checked} / {j.ls.length}</td>
                                  <td className="px-4 py-2 text-right font-semibold">{fmtCurrency(j.total)}</td>
                                  <td className="px-4 py-2 text-right">
                                    <button type="button" disabled={runBusy} onClick={() => setInRun(j.ls, false)} className="text-xs text-[var(--muted)] hover:text-red-700 hover:underline disabled:opacity-50">Remove</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {runView.past.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold">Previous pay runs</h2>
              <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full whitespace-nowrap text-sm">
                  <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-2">Pay date</th>
                      <th className="px-4 py-2 text-right">Contractors</th>
                      <th className="px-4 py-2 text-right">Jobs</th>
                      <th className="px-4 py-2 text-right">Ex GST</th>
                      <th className="px-4 py-2 text-right">Inc GST</th>
                      <th className="px-4 py-2">Emailed</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runView.past.map((r) => (
                      <tr key={r.run.id} className="border-t border-[var(--border)]">
                        <td className="px-4 py-2 font-medium">{fmtDate(r.run.pay_date)}</td>
                        <td className="px-4 py-2 text-right">{r.rows.length}</td>
                        <td className="px-4 py-2 text-right">{r.jobs}</td>
                        <td className="px-4 py-2 text-right">{fmtCurrency(r.total)}</td>
                        <td className="px-4 py-2 text-right">{fmtCurrency(r.total + r.gst)}</td>
                        <td className="px-4 py-2 text-[var(--muted)]">{r.run.emailed_at ? new Date(r.run.emailed_at).toLocaleDateString("en-AU") : "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button type="button" onClick={() => downloadRunPdf(r.run)} className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium hover:border-accent">PDF</button>
                          <button type="button" onClick={() => previewRunPdf(r.run)} className="ml-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium hover:border-accent">Email again</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "paid" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-[var(--border)] bg-[#f2f0ec] p-4 print:hidden">
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Pay week from
              <input type="date" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Pay week to
              <input type="date" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Contractor
              <select value={paidContractor} onChange={(e) => setPaidContractor(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]">
                <option value="">All contractors</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Search
              <input placeholder="WO, quote, customer, address..." value={paidSearch} onChange={(e) => setPaidSearch(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <div className="flex flex-wrap gap-1 pb-0.5">
              <button type="button" onClick={() => { const w = addDays(mondayOfDay(todayAU()), -7); setPaidFrom(w); setPaidTo(w); }} className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-xs font-medium hover:border-accent">Last week</button>
              <button type="button" onClick={() => { setPaidFrom(addDays(mondayOfDay(todayAU()), -28)); setPaidTo(""); }} className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-xs font-medium hover:border-accent">Last 4 weeks</button>
              <button type="button" onClick={() => { const t = todayAU(); setPaidFrom(`${t.slice(0, 7)}-01`); setPaidTo(""); }} className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-xs font-medium hover:border-accent">This month</button>
              {(paidFrom || paidTo || paidContractor || paidSearch) && (
                <button type="button" onClick={() => { setPaidFrom(""); setPaidTo(""); setPaidContractor(""); setPaidSearch(""); }} className="px-2 py-1.5 text-xs text-[var(--muted)] hover:underline">Show all</button>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setOpen(new Set(paidReport.rows.map((r) => r.key)))} className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:border-accent">Expand all</button>
              <button type="button" onClick={() => setOpen(new Set())} className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:border-accent">Collapse all</button>
              <button type="button" onClick={exportPaidCsv} className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:border-accent">Export CSV</button>
              <button type="button" onClick={() => window.print()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">Print</button>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)] print:hidden">
            Every job with lines ticked paid, grouped by the pay week they were paid in (newest first). Older payments made before pay weeks were recorded are filed under the week the work was done.
          </p>
          <p className="mt-1 hidden text-sm print:block">
            {paidFrom || paidTo ? `Pay weeks ${paidFrom ? fmtDate(mondayOfDay(paidFrom)) : "start"} to ${paidTo ? fmtDate(addDays(mondayOfDay(paidTo), 6)) : "now"}` : "All pay weeks"}
            {paidContractor ? ` · ${subById.get(paidContractor)?.name || ""}` : ""}
            {paidSearch ? ` · search "${paidSearch}"` : ""} · printed {fmtDate(todayAU())}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Paid (ex GST)</div>
              <div className="mt-1 text-2xl font-bold text-green-700">{fmtCurrency(paidReport.exGst)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">GST</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(paidReport.gst)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">GST-registered contractors only</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Paid (inc GST)</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(paidReport.exGst + paidReport.gst)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Jobs paid</div>
              <div className="mt-1 text-2xl font-bold">{paidReport.jobs}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{paidReport.contractors} contractor{paidReport.contractors === 1 ? "" : "s"}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            {paidReport.groups.length === 0 && (
              <div className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-[var(--muted)]">No paid jobs match these filters.</div>
            )}
            {paidReport.groups.map((g) => (
              <div key={g.week || "none"} className="break-inside-avoid-page rounded-xl border border-[var(--border)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[#f2f0ec] px-4 py-3">
                  <div className="font-semibold">
                    {g.week ? `Pay week ${fmtDate(g.week)} – ${fmtDate(addDays(g.week, 6))}` : "Pay week not recorded"}
                    <span className="ml-2 text-xs font-normal text-[var(--muted)]">{g.rows.length} job{g.rows.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div><span className="text-[var(--muted)]">Paid </span><span className="font-bold">{fmtCurrency(g.exGst)}</span></div>
                    {g.gst > 0.005 && <div><span className="text-[var(--muted)]">inc GST </span><span className="font-semibold">{fmtCurrency(g.exGst + g.gst)}</span></div>}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-sm">
                    <thead className="text-left text-xs uppercase text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-2">Work order</th>
                        <th className="px-4 py-2">Contractor</th>
                        <th className="px-4 py-2">Customer / site</th>
                        <th className="px-4 py-2">Completed</th>
                        <th className="px-4 py-2 text-right">Lines</th>
                        <th className="px-4 py-2 text-right">Paid (ex GST)</th>
                        <th className="px-4 py-2 text-right">Inc GST</th>
                        <th className="px-4 py-2 text-right">Job status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => {
                        const p = r.ls[0].work_orders?.projects;
                        const isOpen = open.has(r.key);
                        return (
                          <Fragment key={r.key}>
                            <tr className="border-t border-[var(--border)]">
                              <td className="px-4 py-2">
                                <button type="button" className="mr-1 text-[var(--muted)] print:hidden" onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })} aria-label={isOpen ? "Collapse" : "Expand"}>{isOpen ? "▾" : "▸"}</button>
                                <Link href={`/dashboard/work-orders/${r.woId}`} className="text-accent hover:underline">{r.ls[0].work_orders?.wo_number || "—"}</Link>
                              </td>
                              <td className="px-4 py-2">{r.sub?.name || "—"}</td>
                              <td className="px-4 py-2">
                                {p ? `${quoteLabel(p as any)} — ${p.customers?.name || "—"}` : "—"}
                                {p && [p.address, p.suburb].filter(Boolean).length > 0 && <div className="text-xs text-[var(--muted)]">{[p.address, p.suburb].filter(Boolean).join(", ")}</div>}
                              </td>
                              <td className="px-4 py-2 text-[var(--muted)]">{fmtDate(r.doneDate)}</td>
                              <td className="px-4 py-2 text-right text-[var(--muted)]">{r.ls.length}</td>
                              <td className="px-4 py-2 text-right font-semibold">{fmtCurrency(r.exGst)}</td>
                              <td className="px-4 py-2 text-right text-[var(--muted)]">{fmtCurrency(r.exGst + r.gst)}</td>
                              <td className="px-4 py-2 text-right">
                                {r.notPaid > 0.005 ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Part paid · {fmtCurrency(r.notPaid)} not paid</span>
                                ) : (
                                  <span className="text-xs font-semibold text-green-700">✓ Fully paid</span>
                                )}
                              </td>
                            </tr>
                            {isOpen && r.ls.map((l) => {
                              const rate = lineRate(l.rate, l.labour_items?.contractor_rate, l.parts?.installer_rate_per_m2);
                              return (
                                <tr key={l.id} className="border-t border-[var(--border)] text-xs text-[var(--muted)]">
                                  <td className="px-4 py-1.5"></td>
                                  <td className="px-4 py-1.5" colSpan={2}>
                                    <span className="text-sm text-[var(--text)]">{l.parts?.name || (l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—")}</span>
                                    {l.note && <div>{l.note}</div>}
                                  </td>
                                  <td className="px-4 py-1.5">{fmtDate(l.task_date)}</td>
                                  <td className="px-4 py-1.5 text-right">qty {l.qty} × {fmtCurrency(rate)}</td>
                                  <td className="px-4 py-1.5 text-right text-sm text-[var(--text)]">{fmtCurrency(l.cost)}</td>
                                  <td className="px-4 py-1.5" colSpan={2}></td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                      <tr className="border-t border-[var(--border)] bg-[#f2f0ec] font-semibold">
                        <td className="px-4 py-2" colSpan={5}>Week total</td>
                        <td className="px-4 py-2 text-right">{fmtCurrency(g.exGst)}</td>
                        <td className="px-4 py-2 text-right">{fmtCurrency(g.exGst + g.gst)}</td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "upcoming" && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Committed, not completed</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(upcoming.total)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">ex GST · {upcoming.jobCount} work order{upcoming.jobCount === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">This week or overdue</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(upcoming.thisWeek)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{upcoming.thisJobs} job{upcoming.thisJobs === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Next week</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(upcoming.nextWeek)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{upcoming.nextJobs} job{upcoming.nextJobs === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Later / unscheduled</div>
              <div className="mt-1 text-2xl font-bold">{fmtCurrency(upcoming.later)}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{upcoming.laterJobs} job{upcoming.laterJobs === 1 ? "" : "s"}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4 rounded-xl border border-[var(--border)] bg-[#f2f0ec] p-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
              Contractor
              <select value={contractorFilter} onChange={(e) => setContractorFilter(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]">
                <option value="">All contractors</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <p className="ml-auto max-w-sm text-xs text-[var(--muted)]">Allocated work orders that aren&apos;t finished yet. This is a forecast — nothing here is owed or can be marked paid.</p>
          </div>
          <div className="mt-4 flex flex-col gap-5">
            {upcoming.rows.length === 0 && (
              <div className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-[var(--muted)]">No allocated work waiting to be completed.</div>
            )}
            {upcoming.rows.map(({ sub, jobs, total }) => (
              <div key={sub.id} className="rounded-xl border border-[var(--border)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[#f2f0ec] px-4 py-3">
                  <div className="font-semibold">{sub.name}</div>
                  <div className="text-sm"><span className="text-[var(--muted)]">Committed </span><span className="font-bold">{fmtCurrency(total)}</span></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-sm">
                    <thead className="text-left text-xs uppercase text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-2">Work order</th>
                        <th className="px-4 py-2">Customer / site</th>
                        <th className="px-4 py-2">Scheduled</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Lines left</th>
                        <th className="px-4 py-2 text-right">Value (ex GST)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((j) => {
                        const p = j.ls[0].work_orders?.projects;
                        const range = j.first ? (j.last && j.last !== j.first ? `${fmtDate(j.first)} – ${fmtDate(j.last)}` : fmtDate(j.first)) : "No date";
                        return (
                          <tr key={j.woId} className="border-t border-[var(--border)]">
                            <td className="px-4 py-2"><Link href={`/dashboard/work-orders/${j.woId}`} className="text-accent hover:underline">{j.ls[0].work_orders?.wo_number || "—"}</Link></td>
                            <td className="px-4 py-2">
                              {p ? `${quoteLabel(p as any)} — ${p.customers?.name || "—"}` : "—"}
                              {p && [p.address, p.suburb].filter(Boolean).length > 0 && <div className="text-xs text-[var(--muted)]">{[p.address, p.suburb].filter(Boolean).join(", ")}</div>}
                            </td>
                            <td className={`px-4 py-2 ${j.first ? "" : "text-[var(--muted)]"}`}>{range}</td>
                            <td className="px-4 py-2">
                              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${j.started ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                                {j.started ? `In progress · ${j.doneCount} of ${j.count} done` : "Allocated"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-[var(--muted)]">{j.ls.length}</td>
                            <td className="px-4 py-2 text-right font-semibold">{fmtCurrency(j.value)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
