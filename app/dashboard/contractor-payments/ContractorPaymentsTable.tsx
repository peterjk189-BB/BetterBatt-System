"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

type Sub = { id: string; name: string; phone: string | null; email: string | null; gst_registered: boolean };

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
    projects: { quote_number: number; customers: { name: string } | null } | null;
  } | null;
  labour_items: { code: string; description: string; contractor_rate: number } | null;
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

  const [status, setStatus] = useState<StatusFilter>("unpaid");
  const [contractorFilter, setContractorFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const computed = useMemo(
    () =>
      lines
        .filter((l) => l.work_orders && !l.work_orders.archived)
        .map((l) => {
          const rate = l.labour_items?.contractor_rate || 0;
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

  function exportCsv() {
    const header = [
      "Contractor",
      "GST registered",
      "Date",
      "Work order",
      "Customer",
      "Task",
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
            csvCell(l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—"),
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
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `contractor-payments-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contractor Payments</h1>
        <button
          onClick={exportCsv}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent"
        >
          Export CSV
        </button>
      </div>

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
        {contractorRows.map(({ sub, lines: subLines, owed, paidTotal, gst, owedWithGst }) => {
          const visibleLines = [...subLines].sort((a, b) => (b.task_date || "").localeCompare(a.task_date || ""));
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
                    {[sub.phone, sub.email].filter(Boolean).join(" · ") || "No mobile/email on file"}
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
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-sm">
                  <thead className="text-left text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Work order</th>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Task</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">$</th>
                      <th className="px-4 py-2">Note</th>
                      <th className="px-4 py-2">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLines.map((l) => (
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
                          {l.labour_items ? `${l.labour_items.code} — ${l.labour_items.description}` : "—"}
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
    </div>
  );
}
