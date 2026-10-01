"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Sub = { id: string; name: string; phone: string | null; email: string | null };

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

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-AU") : "—";
}

export default function ContractorPaymentsTable({ subs, lines }: { subs: Sub[]; lines: Line[] }) {
  const supabase = createClient();
  const [paidOverrides, setPaidOverrides] = useState<Record<string, boolean>>({});
  const [showPaid, setShowPaid] = useState(false);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const subById = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s])), [subs]);

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

  const byContractor = useMemo(() => {
    const map = new Map<string, typeof computed>();
    for (const l of computed) {
      if (!l.contractorId) continue;
      const arr = map.get(l.contractorId) || [];
      arr.push(l);
      map.set(l.contractorId, arr);
    }
    return map;
  }, [computed]);

  const unassignedLines = computed.filter((l) => !l.contractorId);

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
    }
  }

  const contractorRows = subs
    .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    .map((s) => {
      const subLines = byContractor.get(s.id) || [];
      const owed = subLines.filter((l) => !l.paid).reduce((sum, l) => sum + l.cost, 0);
      const paidTotal = subLines.filter((l) => l.paid).reduce((sum, l) => sum + l.cost, 0);
      return { sub: s, lines: subLines, owed, paidTotal };
    })
    .filter((row) => row.lines.length > 0);

  const grandOwed = contractorRows.reduce((s, r) => s + r.owed, 0);
  const grandPaid = contractorRows.reduce((s, r) => s + r.paidTotal, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contractor Payments</h1>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Total owed (unpaid)</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{fmtCurrency(grandOwed)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Total paid</div>
          <div className="mt-1 text-2xl font-bold">{fmtCurrency(grandPaid)}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <input
          placeholder="Search contractor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />
          Show paid lines too
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        {contractorRows.map(({ sub, lines: subLines, owed, paidTotal }) => {
          const visibleLines = (showPaid ? subLines : subLines.filter((l) => !l.paid)).sort((a, b) =>
            (b.task_date || "").localeCompare(a.task_date || "")
          );
          return (
            <div key={sub.id} className="rounded-xl border border-[var(--border)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[#f2f0ec] px-4 py-3">
                <div>
                  <div className="font-semibold">{sub.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {[sub.phone, sub.email].filter(Boolean).join(" · ") || "No mobile/email on file"}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-[var(--muted)]">Owed </span>
                    <span className="font-bold text-red-700">{fmtCurrency(owed)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Paid </span>
                    <span className="font-semibold">{fmtCurrency(paidTotal)}</span>
                  </div>
                </div>
              </div>

              {visibleLines.length === 0 ? (
                <div className="px-4 py-4 text-sm text-[var(--muted)]">
                  {showPaid ? "No task lines." : "Nothing unpaid — nice."}
                </div>
              ) : (
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
              )}
            </div>
          );
        })}
        {contractorRows.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] px-4 py-8 text-center text-[var(--muted)]">
            No contractor task lines found.
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
