"use client";

import Link from "next/link";
import { useState } from "react";
import { applyOrder, type HomeLayout } from "@/lib/homeLayout";
import type { BoardData } from "@/lib/homeBoard";

type Action = { label: string; href: string; primary?: boolean };
type Followup = { id: string; title: string; href: string; overdue: boolean };

const SECTION_LABELS: Record<string, string> = {
  money: "Money strip",
  actions: "Quick actions",
  today: "Today",
  attention: "Needs attention",
  followups: "My follow-ups",
};
const DEFAULT_ORDER = ["money", "actions", "today", "attention", "followups"];
const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const TONE: Record<string, string> = { r: "#ff7a70", y: "#f5c04a", b: "#4f8cff" };

/** Office/admin home page: what needs doing today. Sections can be reordered or hidden with Arrange. */
export default function HomeBoard({
  data, actions, followups, layout, todayLabel, name, showFollowups,
}: {
  data: BoardData; actions: Action[]; followups: Followup[]; layout: HomeLayout; todayLabel: string; name: string; showFollowups: boolean;
}) {
  const all = DEFAULT_ORDER.filter((k) => k !== "followups" || showFollowups);
  const [order, setOrder] = useState<string[]>(() => applyOrder(all.map((key) => ({ key })), layout.sections).map((x) => x.key));
  const [hidden, setHidden] = useState<string[]>(layout.hiddenSections.filter((k) => all.includes(k)));
  const [editing, setEditing] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function commit(o: string[], h: string[]) {
    setOrder(o);
    setHidden(h);
    setMsg("");
    const res = await fetch("/api/home-layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections: o, hiddenSections: h }) });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error || "Could not save your layout.");
  }
  const visible = order.filter((k) => !hidden.includes(k));
  function move(key: string, to: number) {
    const from = order.indexOf(key);
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    const next = order.slice();
    next.splice(from, 1);
    next.splice(to, 0, key);
    commit(next, hidden);
  }
  function step(key: string, dir: -1 | 1) {
    const idx = visible.indexOf(key) + dir;
    if (idx >= 0 && idx < visible.length) move(key, order.indexOf(visible[idx]));
  }

  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm";
  const h2 = "mb-2 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";

  function body(k: string) {
    if (k === "money") {
      const m = data.money;
      const tile = (label: string, value: string, sub: string, subCls = "text-[var(--muted)]") => (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
          <p className={`text-xs ${subCls}`}>{sub}</p>
        </div>
      );
      return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tile("Owed to us", money(m.owed), m.overdue > 0 ? `${money(m.overdue)} overdue` : "Nothing overdue", m.overdue > 0 ? "text-[#ff7a70]" : "text-[var(--muted)]")}
          {tile("Invoiced this month", money(m.invoicedMonth), "ex GST")}
          {tile("Contractor pay due", money(m.contractorDue), "unpaid, all jobs")}
          {tile("Open quotes", String(m.openQuotes), m.oldQuotes > 0 ? `${m.oldQuotes} older than 30 days` : "None older than 30 days", m.oldQuotes > 0 ? "text-[#f5c04a]" : "text-[var(--muted)]")}
        </div>
      );
    }
    if (k === "actions") {
      return (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${a.primary ? "bg-[#fdb930] text-[#201f1c]" : "border border-[var(--border)] bg-[var(--surface)]"}`}>
              {a.label}
            </Link>
          ))}
        </div>
      );
    }
    if (k === "today") {
      return (
        <div className={card}>
          <h2 className={h2}><span>Today · {todayLabel}</span><Link href="/dashboard/calendar" className="normal-case tracking-normal text-accent hover:underline">Calendar</Link></h2>
          {data.today.length === 0 && <p className="py-2 text-sm text-[var(--muted)]">Nothing booked for today.</p>}
          <div className="divide-y divide-[var(--border)]">
            {data.today.map((t, i) => (
              <Link key={i} href={t.href} className="flex items-start gap-3 py-2 text-sm hover:underline">
                <span className="w-12 shrink-0 font-bold tabular-nums text-[#b1841f]">{t.time}</span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{t.title}</span><span className="block text-xs text-[var(--muted)]">{t.sub}</span></span>
                <span className="shrink-0 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold">{t.status}</span>
              </Link>
            ))}
          </div>
        </div>
      );
    }
    if (k === "attention") {
      return (
        <div className={card}>
          <h2 className={h2}><span>Needs attention</span>{data.attention.length > 0 && <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] text-[#ff7a70]">{data.attention.length}</span>}</h2>
          {data.attention.length === 0 && <p className="py-2 text-sm text-[var(--muted)]">All clear.</p>}
          <div className="divide-y divide-[var(--border)]">
            {data.attention.map((a, i) => (
              <Link key={i} href={a.href} className="flex items-start gap-3 py-2 text-sm hover:underline">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TONE[a.tone] }} />
                <span className="min-w-0 flex-1"><span className="block font-medium">{a.title}</span><span className="block text-xs text-[var(--muted)]">{a.sub}</span></span>
                <span className="shrink-0 text-xs text-accent">Open</span>
              </Link>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className={card}>
        <h2 className={h2}><span>My follow-ups due</span><Link href="/dashboard/crm?tab=tasks" className="normal-case tracking-normal text-accent hover:underline">Open tasks</Link></h2>
        {followups.length === 0 && <p className="py-2 text-sm text-[var(--muted)]">Nothing due.</p>}
        <div className="divide-y divide-[var(--border)]">
          {followups.map((t) => (
            <Link key={t.id} href={t.href} className="flex items-center justify-between gap-3 py-2 text-sm hover:underline">
              <span className="min-w-0 truncate font-medium">{t.title}</span>
              <span className={`shrink-0 text-xs font-medium ${t.overdue ? "text-[#ff7a70]" : "text-[var(--muted)]"}`}>{t.overdue ? "Overdue" : "Today"}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const hiddenList = order.filter((k) => hidden.includes(k));
  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{name}</h2>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-red-600">{msg}</span>}
          {editing && <button type="button" onClick={() => commit(all, [])} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)]">Reset to default</button>}
          <button type="button" onClick={() => setEditing((e) => !e)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${editing ? "bg-[#fdb930] text-[#201f1c]" : "border border-[var(--border)]"}`}>
            {editing ? "Done" : "Arrange sections"}
          </button>
        </div>
      </div>
      {editing && <p className="mb-3 text-sm text-[#b1841f]">Drag a section, or use the arrows, to move it. Hide the ones you don&apos;t want; they wait below.</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visible.map((k, i) => {
          const wide = k === "money" || k === "actions" || k === "followups";
          return (
            <div
              key={k}
              className={wide ? "lg:col-span-2" : ""}
              draggable={editing}
              onDragStart={(e) => { setDragKey(k); e.dataTransfer.setData("text/plain", k); }}
              onDragEnd={() => { setDragKey(null); setOverKey(null); }}
              onDragOver={(e) => { if (editing) { e.preventDefault(); setOverKey(k); } }}
              onDragLeave={() => setOverKey((o) => (o === k ? null : o))}
              onDrop={(e) => { if (!editing) return; e.preventDefault(); if (dragKey && dragKey !== k) move(dragKey, order.indexOf(k)); setDragKey(null); setOverKey(null); }}
              style={{ opacity: dragKey === k ? 0.4 : 1, outline: editing && overKey === k && dragKey !== k ? "2px solid #fdb930" : undefined, borderRadius: 12 }}
            >
              {editing && (
                <div className="mb-1 flex items-center justify-between rounded-lg border border-dashed border-[#b1841f] px-2 py-1 text-xs">
                  <span className="cursor-grab text-[#b1841f]">⋮⋮ {SECTION_LABELS[k]}</span>
                  <span className="flex gap-1">
                    <button type="button" aria-label={`Move ${SECTION_LABELS[k]} up`} disabled={i === 0} onClick={() => step(k, -1)} className="rounded border border-[var(--border)] px-2 disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Move ${SECTION_LABELS[k]} down`} disabled={i === visible.length - 1} onClick={() => step(k, 1)} className="rounded border border-[var(--border)] px-2 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => commit(order, [...hidden, k])} className="rounded border border-[var(--border)] px-2">Hide</button>
                  </span>
                </div>
              )}
              {body(k)}
            </div>
          );
        })}
      </div>

      {editing && hiddenList.length > 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--border)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Hidden (tap to bring back)</p>
          <div className="flex flex-wrap gap-2">
            {hiddenList.map((k) => (
              <button key={k} type="button" onClick={() => commit(order, hidden.filter((h) => h !== k))} className="rounded-full bg-[#fdb930] px-3 py-1 text-sm font-semibold text-[#201f1c]">{SECTION_LABELS[k]} +</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
