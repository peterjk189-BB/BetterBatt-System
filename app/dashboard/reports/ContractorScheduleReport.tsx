"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { siteAddress } from "@/lib/siteAddress";
import { quoteLabel } from "@/lib/quoteLabel";
import { installedM2 } from "@/lib/installedM2";

type Row = {
  date: string;
  time: string;
  contractor: string;
  woNumber: string;
  quote: string;
  customer: string;
  address: string;
  task: string;
  m2: number;
  authorised: boolean;
  status: "Scheduled" | "On hold" | "Complete";
  note: string;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const dayName = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short" });
const nice = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const num = (n: number) => Math.round(n * 100) / 100;
const UNASSIGNED = "Unassigned";

export default function ContractorScheduleReport() {
  const supabase = useMemo(() => createClient(), []);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 27));
  const [contractor, setContractor] = useState("All");
  const [includeDone, setIncludeDone] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      const { data, error: err } = await supabase
        .from("work_order_lines")
        .select(
          "id, task_date, note, qty, completed, work_order_id, subcontractor_id, work_orders(wo_number, archived, authorised_at, projects(quote_number, revision_letter, lot_no, address, suburb, customers(name)), subcontractors(name)), subcontractors(name), labour_items(code, description), parts(name, is_stock_item)"
        )
        .gte("task_date", from)
        .lte("task_date", to)
        .order("task_date");
      if (!alive) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      // Start times and on-hold flags live in newer columns: fetched on their own so this still works before those migrations.
      const [timesRes, heldRes] = await Promise.all([
        supabase.from("work_order_lines").select("id, task_time").not("task_time", "is", null).gte("task_date", from).lte("task_date", to),
        supabase.from("work_orders").select("id").eq("on_hold", true),
      ]);
      const times = new Map(((timesRes.data ?? []) as any[]).map((r) => [r.id as string, r.task_time as string]));
      const held = new Set(((heldRes.data ?? []) as any[]).map((r) => r.id as string));

      const out: Row[] = [];
      for (const l of (data ?? []) as any[]) {
        const wo = l.work_orders;
        if (!wo || wo.archived) continue;
        const status: Row["status"] = l.completed ? "Complete" : held.has(l.work_order_id) ? "On hold" : "Scheduled";
        if (status === "Complete" && !includeDone) continue;
        const p = wo.projects;
        out.push({
          date: l.task_date,
          time: (times.get(l.id) || "").slice(0, 5),
          contractor: l.subcontractors?.name || wo.subcontractors?.name || UNASSIGNED,
          woNumber: wo.wo_number || "",
          quote: p?.quote_number ? quoteLabel(p) : "",
          customer: p?.customers?.name || "",
          address: siteAddress(p),
          task: l.labour_items?.description || l.parts?.name || l.labour_items?.code || "",
          m2: installedM2(l),
          authorised: !!wo.authorised_at,
          status,
          note: l.note || "",
        });
      }
      out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.woNumber.localeCompare(b.woNumber));
      setRows(out);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, from, to, includeDone]);

  const contractors = useMemo(() => Array.from(new Set<string>(rows.map((r) => r.contractor))).sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b))), [rows]);
  const shown = useMemo(() => rows.filter((r) => contractor === "All" || r.contractor === contractor), [rows, contractor]);
  const totalM2 = shown.reduce((t, r) => t + r.m2, 0);
  const unassigned = shown.filter((r) => r.contractor === UNASSIGNED).length;
  const notAuth = shown.filter((r) => !r.authorised).length;

  async function exportXlsx() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Better Batt Insulation";
      const cols = [
        { header: "Date", key: "date", width: 16 },
        { header: "Day", key: "day", width: 7 },
        { header: "Start", key: "time", width: 8 },
        { header: "Contractor", key: "contractor", width: 22 },
        { header: "Work order", key: "woNumber", width: 14 },
        { header: "Quote", key: "quote", width: 10 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Site address", key: "address", width: 42 },
        { header: "Task", key: "task", width: 34 },
        { header: "m²", key: "m2", width: 9 },
        { header: "Authorised", key: "authorised", width: 12 },
        { header: "Status", key: "status", width: 12 },
        { header: "Notes", key: "note", width: 40 },
      ];
      const used = new Set<string>();
      const addSheet = (name: string, list: Row[]) => {
        let n = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sheet";
        let k = 2;
        const base = n;
        while (used.has(n.toLowerCase())) n = `${base.slice(0, 25)} ${k++}`;
        used.add(n.toLowerCase());
        const ws = wb.addWorksheet(n, { views: [{ state: "frozen", ySplit: 1 }] });
        ws.columns = cols;
        const head = ws.getRow(1);
        head.font = { bold: true, color: { argb: "FFFFFFFF" } };
        head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
        head.alignment = { vertical: "middle" };
        for (const r of list) {
          const [y, m, d] = r.date.split("-").map(Number);
          const row = ws.addRow({
            date: new Date(Date.UTC(y, m - 1, d)),
            day: dayName(r.date),
            time: r.time,
            contractor: r.contractor,
            woNumber: r.woNumber,
            quote: r.quote,
            customer: r.customer,
            address: r.address,
            task: r.task,
            m2: num(r.m2),
            authorised: r.authorised ? "Yes" : "NOT YET",
            status: r.status,
            note: r.note,
          });
          row.getCell("date").numFmt = "ddd d mmm yyyy";
          row.getCell("m2").numFmt = "0.0";
          row.alignment = { vertical: "top", wrapText: true };
          if (!r.authorised) row.getCell("authorised").font = { bold: true, color: { argb: "FFB91C1C" } };
          if (r.contractor === UNASSIGNED) row.getCell("contractor").font = { bold: true, color: { argb: "FFB45309" } };
          if (r.status === "On hold") row.getCell("status").font = { bold: true, color: { argb: "FFB45309" } };
        }
        const total = ws.addRow({ address: "Total", m2: num(list.reduce((t, r) => t + r.m2, 0)) });
        total.font = { bold: true };
        total.getCell("m2").numFmt = "0.0";
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
        ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      };
      addSheet("All jobs", shown);
      const names = Array.from(new Set<string>(shown.map((r) => r.contractor))).sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)));
      if (names.length > 1) for (const n of names) addSheet(n, shown.filter((r) => r.contractor === n));

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `contractor-schedule-${from}-to-${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Could not create the Excel file");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-[var(--muted)]">
        Every work order task on the calendar between two dates: who it is assigned to, whether it has been authorised, the site and the m². Download it as Excel
        with one sheet for all jobs and one sheet for each contractor.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          Contractor
          <select value={contractor} onChange={(e) => setContractor(e.target.value)} className="rounded-lg border border-[var(--border)] px-3 py-1.5">
            <option value="All">All contractors</option>
            {contractors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          Include completed
        </label>
        <button onClick={exportXlsx} disabled={!shown.length || exporting} className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {exporting ? "Creating…" : "Download Excel"}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span>
          <b>{shown.length}</b> tasks
        </span>
        <span>
          <b>{num(totalM2)}</b> m²
        </span>
        {unassigned > 0 && (
          <span style={{ color: "#b45309" }}>
            <b>{unassigned}</b> with no contractor yet
          </span>
        )}
        {notAuth > 0 && (
          <span style={{ color: "#b91c1c" }}>
            <b>{notAuth}</b> not authorised yet
          </span>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-[#f2f0ec] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">Contractor</th>
              <th className="px-3 py-2">Work order</th>
              <th className="px-3 py-2">Site address</th>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2 text-right">m²</th>
              <th className="px-3 py-2">Authorised</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[var(--muted)]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[var(--muted)]">
                  Nothing scheduled in this date range.
                </td>
              </tr>
            )}
            {!loading &&
              shown.map((r, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{nice(r.date)}</td>
                  <td className="px-3 py-2">{r.time || "—"}</td>
                  <td className="px-3 py-2" style={r.contractor === UNASSIGNED ? { color: "#b45309", fontWeight: 600 } : undefined}>
                    {r.contractor}
                  </td>
                  <td className="px-3 py-2">{r.woNumber}</td>
                  <td className="px-3 py-2">{r.address || "—"}</td>
                  <td className="px-3 py-2">{r.task || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.m2 ? num(r.m2) : "—"}</td>
                  <td className="px-3 py-2" style={r.authorised ? undefined : { color: "#b91c1c", fontWeight: 600 }}>
                    {r.authorised ? "Yes" : "Not yet"}
                  </td>
                  <td className="px-3 py-2" style={r.status === "On hold" ? { color: "#b45309", fontWeight: 600 } : undefined}>
                    {r.status}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
