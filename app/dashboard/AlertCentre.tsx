"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export type AlertRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  path: string | null;
  status: "new" | "later" | "done";
  actor: string | null;
  created_at: string;
};

export function alertWhen(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  });
}

const KIND_ICON: Record<string, string> = {
  site_visit_booked: "📅",
  site_visit_done: "✅",
  swms_started: "🦺",
  swms_completed: "🦺",
  inspection_booked: "🔍",
  inspection_failed: "⚠️",
  email_bounce: "📧",
  contractor_invoice: "🧾",
};

/**
 * Header link with a count of open alerts, plus a pop-up that stays on screen until every
 * new alert has been acknowledged (Done, Follow up later, or opened).
 */
export default function AlertCentre({ userId, suppressPopup }: { userId: string; suppressPopup: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("alerts")
      .select("id, kind, title, body, path, status, actor, created_at")
      .in("status", ["new", "later"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setRows(data as AlertRow[]);
  }, [supabase]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  async function setStatus(ids: string[], status: "later" | "done") {
    if (ids.length === 0) return;
    setBusy(true);
    setRows((r) => r.filter((x) => !(ids.includes(x.id) && status === "done")).map((x) => (ids.includes(x.id) ? { ...x, status } : x)));
    await supabase.from("alerts").update({ status, acted_by: userId, acted_at: new Date().toISOString() }).in("id", ids);
    setBusy(false);
  }

  // Pop-up: anything nobody has acknowledged yet, except things this person did themselves.
  const popup = suppressPopup ? [] : rows.filter((r) => r.status === "new" && r.actor !== userId);
  const open = rows.length;

  return (
    <>
      <Link
        href="/dashboard/alerts"
        className="relative rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium hover:border-accent"
        title="Site visits, SWMS and inspections that need following up"
      >
        Alerts
        {open > 0 && (
          <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${rows.some((r) => r.status === "new") ? "bg-red-600" : "bg-amber-500"}`}>
            {open}
          </span>
        )}
      </Link>

      {popup.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 print:hidden" role="alertdialog" aria-modal="true" aria-label="New alerts">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-[var(--border)] bg-white p-5 text-black shadow-2xl">
            <h2 className="text-lg font-bold">
              {popup.length === 1 ? "1 new alert" : `${popup.length} new alerts`}
            </h2>
            <p className="mt-1 text-sm text-gray-500">Press Done when it&apos;s sorted, or Follow up later to keep it on the Alerts page.</p>
            <div className="mt-3 flex flex-col gap-3">
              {popup.map((a) => (
                <div key={a.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none">{KIND_ICON[a.kind] || "🔔"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{a.title}</div>
                      {a.body && <div className="text-sm text-gray-600">{a.body}</div>}
                      <div className="mt-0.5 text-xs text-gray-400">{alertWhen(a.created_at)}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    <button disabled={busy} onClick={() => setStatus([a.id], "done")} className="rounded-lg bg-green-700 px-3 py-1.5 font-medium text-white disabled:opacity-60">
                      Done
                    </button>
                    <button disabled={busy} onClick={() => setStatus([a.id], "later")} className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium disabled:opacity-60">
                      Follow up later
                    </button>
                    {a.path && (
                      <Link
                        href={a.path}
                        onClick={() => setStatus([a.id], "later")}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-blue-700"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {popup.length > 1 && (
              <button
                disabled={busy}
                onClick={() => setStatus(popup.map((p) => p.id), "later")}
                className="mt-4 w-full rounded-lg bg-[#201f1c] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                Got it — follow up later (all)
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
