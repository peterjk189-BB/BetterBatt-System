"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { alertWhen, type AlertRow } from "../AlertCentre";

type Row = AlertRow & { acted_at: string | null };

export default function AlertsList() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error: e } = await supabase
      .from("alerts")
      .select("id, kind, title, body, path, status, actor, created_at, acted_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);
    if (e) {
      setError(/relation|schema cache|does not exist/i.test(e.message) ? "Alerts needs one more setup step (migration 0066 in Supabase)." : e.message);
    } else {
      setError(null);
      setRows((data ?? []) as Row[]);
    }
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, supabase]);

  async function setStatus(id: string, status: "new" | "later" | "done") {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error: e } = await supabase
      .from("alerts")
      .update({ status, acted_by: userId, acted_at: new Date().toISOString() })
      .eq("id", id);
    if (e) {
      setError(e.message);
      load();
    }
  }

  const open = rows.filter((r) => r.status !== "done");
  const done = rows.filter((r) => r.status === "done");

  const card = (a: Row) => (
    <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--border)] px-4 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{a.title}</span>
          {a.status === "new" && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">New</span>}
          {a.status === "later" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Follow up</span>}
        </div>
        {a.body && <div className="text-sm text-[var(--muted)]">{a.body}</div>}
        <div className="text-xs text-[var(--muted)]">{alertWhen(a.created_at)}</div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        {a.path && (
          <Link href={a.path} className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium text-accent hover:border-accent">
            Open
          </Link>
        )}
        {a.status !== "done" ? (
          <>
            {a.status === "new" && (
              <button onClick={() => setStatus(a.id, "later")} className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium hover:border-accent">
                Follow up later
              </button>
            )}
            <button onClick={() => setStatus(a.id, "done")} className="rounded-lg bg-green-700 px-3 py-1.5 font-medium text-white">
              Done
            </button>
          </>
        ) : (
          <button onClick={() => setStatus(a.id, "later")} className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium hover:border-accent">
            Reopen
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Site visits, SWMS and inspections that need someone to look at them. Anything still on this list hasn&apos;t been marked Done. When one person presses Done it clears for everyone.
      </p>
      {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">{error}</div>}

      <h2 className="mt-6 text-sm font-semibold uppercase text-[var(--muted)]">Needs action ({open.length})</h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">
        {open.map(card)}
        {loaded && open.length === 0 && <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">Nothing to follow up. All clear.</p>}
        {!loaded && <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">Loading…</p>}
      </div>

      <button onClick={() => setShowDone((s) => !s)} className="mt-6 text-sm text-[var(--muted)] underline">
        {showDone ? "Hide done" : `Show done (last 30 days, ${done.length})`}
      </button>
      {showDone && <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">{done.map(card)}</div>}
    </div>
  );
}
