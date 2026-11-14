"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Tab = { key: string; href: string; label: string };

/** "My tabs": favourites strip under the header. Drag a tab from the left menu into it, drag chips to reorder, or use Edit for arrows and add/remove. */
export default function PinnedBar({ tabs, initialPins }: { tabs: Tab[]; initialPins: string[] }) {
  const pathname = usePathname();
  const byKey = Object.fromEntries(tabs.map((t) => [t.key, t]));
  const [pins, setPins] = useState<string[]>(initialPins.filter((k) => byKey[k]));
  const [editing, setEditing] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [hot, setHot] = useState(false);
  const [msg, setMsg] = useState("");

  async function commit(next: string[]) {
    setPins(next);
    setMsg("");
    const res = await fetch("/api/home-layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pins: next }) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error || "Could not save.");
    }
  }
  function put(key: string, before?: string) {
    if (!byKey[key]) return;
    const rest = pins.filter((p) => p !== key);
    const at = before ? rest.indexOf(before) : rest.length;
    rest.splice(at < 0 ? rest.length : at, 0, key);
    commit(rest);
  }
  function shift(key: string, dir: -1 | 1) {
    const i = pins.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= pins.length) return;
    const next = pins.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }

  const unpinned = tabs.filter((t) => !pins.includes(t.key));
  return (
    <div
      className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-2 print:hidden"
      onDragOver={(e) => { e.preventDefault(); setHot(true); }}
      onDragLeave={() => setHot(false)}
      onDrop={(e) => { e.preventDefault(); setHot(false); const k = e.dataTransfer.getData("text/plain"); if (k && !pins.includes(k)) put(k); }}
      style={hot ? { outline: "2px dashed #fdb930", outlineOffset: -3 } : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">My tabs</span>
        {pins.length === 0 && <span className="text-xs text-[var(--muted)]">Drag a tab here from the left menu{editing ? "" : ", or press Edit"}.</span>}
        {pins.map((k) => {
          const t = byKey[k];
          const active = pathname === t.href || !!pathname?.startsWith(t.href + "/");
          return (
            <span
              key={k}
              draggable
              onDragStart={(e) => { setDragKey(k); e.dataTransfer.setData("text/plain", k); }}
              onDragEnd={() => { setDragKey(null); setOverKey(null); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverKey(k); }}
              onDragLeave={() => setOverKey((o) => (o === k ? null : o))}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setHot(false); const d = e.dataTransfer.getData("text/plain") || dragKey; if (d && d !== k) put(d, k); setOverKey(null); }}
              style={{ opacity: dragKey === k ? 0.4 : 1, outline: overKey === k && dragKey !== k ? "2px solid #fdb930" : undefined }}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${active ? "bg-[#201f1c] text-white" : "bg-[#fdb930] text-[#201f1c]"}`}
            >
              {editing && <button type="button" aria-label={`Move ${t.label} earlier`} onClick={() => shift(k, -1)} className="opacity-70">‹</button>}
              <Link href={t.href}>{t.label}</Link>
              {editing && (
                <>
                  <button type="button" aria-label={`Move ${t.label} later`} onClick={() => shift(k, 1)} className="opacity-70">›</button>
                  <button type="button" aria-label={`Unpin ${t.label}`} onClick={() => commit(pins.filter((p) => p !== k))} className="ml-1 opacity-70">✕</button>
                </>
              )}
            </span>
          );
        })}
        {editing && unpinned.length > 0 && (
          <select
            aria-label="Pin a tab"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
            value=""
            onChange={(e) => { if (e.target.value) put(e.target.value); }}
          >
            <option value="">+ Pin a tab…</option>
            {unpinned.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
          </select>
        )}
        <button type="button" onClick={() => setEditing((e) => !e)} className="ml-auto text-xs text-[var(--muted)] hover:underline">
          {editing ? "Done" : "Edit"}
        </button>
        {msg && <span className="text-xs text-red-600">{msg}</span>}
      </div>
    </div>
  );
}
