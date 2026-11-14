"use client";

import { useState } from "react";
import TabIcon from "@/lib/TabIcon";
import { GROUP_ACCENTS } from "@/lib/tabs";
import { applyOrder, type HomeLayout } from "@/lib/homeLayout";

type Tile = { key: string; href: string; label: string; desc: string; group: string };

const ICON_TILE: Record<string, [string, string]> = {
  Sales: ["#fff3d1", "#a87500"],
  Operations: ["#f4ead2", "#b1841f"],
  Insights: ["#dbe7fd", "#2563eb"],
  Admin: ["#e8e8e6", "#5f6062"],
};

/** The home page tiles. Office and admin can press Arrange to drag (or use the arrows to) reorder and hide tiles. */
export default function HomeTiles({ tiles, layout, canArrange }: { tiles: Tile[]; layout: HomeLayout; canArrange: boolean }) {
  const [order, setOrder] = useState<string[]>(() => applyOrder(tiles, layout.tiles).map((t) => t.key));
  const [hidden, setHidden] = useState<string[]>(layout.hidden);
  const [editing, setEditing] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
  const visible = order.filter((k) => byKey[k] && !hidden.includes(k));
  const hiddenTiles = order.filter((k) => byKey[k] && hidden.includes(k));

  async function save(nextOrder: string[], nextHidden: string[]) {
    setMsg("");
    const res = await fetch("/api/home-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tiles: nextOrder, hidden: nextHidden }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error || "Could not save your layout.");
    }
  }
  function commit(nextOrder: string[], nextHidden: string[]) {
    setOrder(nextOrder);
    setHidden(nextHidden);
    save(nextOrder, nextHidden);
  }
  function move(key: string, to: number) {
    const from = order.indexOf(key);
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    const next = order.slice();
    next.splice(from, 1);
    next.splice(to, 0, key);
    commit(next, hidden);
  }
  function step(key: string, dir: -1 | 1) {
    // Move past the next visible tile in that direction.
    const idx = visible.indexOf(key) + dir;
    if (idx < 0 || idx >= visible.length) return;
    move(key, order.indexOf(visible[idx]));
  }
  function reset() {
    commit(tiles.map((t) => t.key), []);
  }

  const list = editing ? visible : visible;
  return (
    <div className="mt-8">
      {canArrange && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {msg && <span className="mr-auto text-xs text-red-600">{msg}</span>}
          {editing && (
            <button type="button" onClick={reset} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)]">
              Reset to default
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${editing ? "bg-[#fdb930] text-[#201f1c]" : "border border-[var(--border)]"}`}
          >
            {editing ? "Done" : "Arrange"}
          </button>
        </div>
      )}
      {editing && <p className="mb-3 text-sm text-[#b1841f]">Drag a tile to move it, or use the arrows. Hide the ones you don&apos;t use; they wait below.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((k, i) => {
          const t = byKey[k];
          const inner = (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: (ICON_TILE[t.group] ?? ICON_TILE.Admin)[0] }}>
                <TabIcon tabKey={t.key} color={(ICON_TILE[t.group] ?? ICON_TILE.Admin)[1]} size={24} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{t.label}</span>
                <span className="mt-1 block text-xs text-[var(--muted)]">{t.desc}</span>
              </span>
            </>
          );
          const base = "flex items-start gap-3 rounded-xl border border-l-4 border-[var(--border)] bg-[var(--surface)] p-4";
          if (!editing) {
            return (
              <a key={k} href={t.href} style={{ borderLeftColor: GROUP_ACCENTS[t.group] ?? "var(--border)" }} className={`${base} transition-colors hover:bg-[var(--bg)]`}>
                {inner}
              </a>
            );
          }
          return (
            <div
              key={k}
              draggable
              onDragStart={(e) => { setDragKey(k); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k); }}
              onDragEnd={() => { setDragKey(null); setOverKey(null); }}
              onDragOver={(e) => { e.preventDefault(); setOverKey(k); }}
              onDragLeave={() => setOverKey((o) => (o === k ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragKey && dragKey !== k) move(dragKey, order.indexOf(k)); setDragKey(null); setOverKey(null); }}
              style={{ borderLeftColor: GROUP_ACCENTS[t.group] ?? "var(--border)", opacity: dragKey === k ? 0.4 : 1, outline: overKey === k && dragKey !== k ? "2px solid #fdb930" : undefined }}
              className={`${base} cursor-grab flex-col border-dashed`}
            >
              <div className="flex w-full items-start gap-3">{inner}</div>
              <div className="flex w-full items-center justify-between gap-2 pt-1">
                <span className="text-xs text-[#b1841f]">⋮⋮ drag</span>
                <span className="flex gap-1">
                  <button type="button" aria-label={`Move ${t.label} earlier`} disabled={i === 0} onClick={() => step(k, -1)} className="rounded border border-[var(--border)] px-2 py-0.5 text-sm disabled:opacity-30">←</button>
                  <button type="button" aria-label={`Move ${t.label} later`} disabled={i === list.length - 1} onClick={() => step(k, 1)} className="rounded border border-[var(--border)] px-2 py-0.5 text-sm disabled:opacity-30">→</button>
                  <button type="button" onClick={() => commit(order, [...hidden, k])} className="rounded border border-[var(--border)] px-2 py-0.5 text-xs">Hide</button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {editing && hiddenTiles.length > 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--border)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Hidden (tap to bring back)</p>
          <div className="flex flex-wrap gap-2">
            {hiddenTiles.map((k) => (
              <button key={k} type="button" onClick={() => commit(order, hidden.filter((h) => h !== k))} className="rounded-full bg-[#fdb930] px-3 py-1 text-sm font-semibold text-[#201f1c]">
                {byKey[k].label} +
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
