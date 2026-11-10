"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

type Option = { id: string; name: string };

/** Searchable product list, always in A–Z order (numbers sorted naturally: R2.5 before R10). */
export default function PartPicker({
  parts,
  value,
  onChange,
  placeholder = "Search product...",
  className = "",
}: {
  parts: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const keyNav = useRef(false);

  // The list is position:fixed so scrolling/overflow-hidden parents (e.g. the line-items table) can't clip it.
  useEffect(() => {
    if (!open) return;
    function place(ev?: Event) {
      // Scrolling the list itself must not re-place it (that re-rendered and snapped the list back to the top on touch screens).
      if (ev && ev.target instanceof Node && listRef.current?.contains(ev.target)) return;
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(448, window.innerWidth * 0.9);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const top = r.bottom + 4;
      setPos((cur) => (cur && cur.left === left && cur.top === top ? cur : { left, top }));
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Keep the highlighted row visible only while using the arrow keys (not on every render / touch scroll).
  useEffect(() => {
    if (!open || !keyNav.current) return;
    keyNav.current = false;
    listRef.current?.querySelector<HTMLElement>('[data-active="1"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const sorted = useMemo(
    () => [...parts].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" })),
    [parts]
  );
  const selected = value ? sorted.find((p) => p.id === value) : undefined;

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return sorted;
    // Spaces/dashes/dots are ignored in the fallback, so "enviroseal" still finds "Enviro-Seal" / "Enviro Seal".
    const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = squash(query);
    return sorted.filter((p) => {
      const n = p.name.toLowerCase();
      return words.every((w) => n.includes(w)) || (q.length >= 3 && squash(p.name).includes(q));
    });
  }, [sorted, query]);

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      keyNav.current = true;
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      keyNav.current = true;
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (matches[active]) pick(matches[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={open ? query : selected?.name ?? ""}
        placeholder={selected ? selected.name : placeholder}
        onFocus={(e) => {
          setOpen(true);
          setQuery("");
          setActive(0);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
        className="w-full min-w-0 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
        title={selected?.name}
      />
      {open && pos && (
        <div
          ref={listRef}
          style={{ position: "fixed", left: pos.left, top: pos.top, WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
          className="z-50 max-h-[45vh] w-[28rem] max-w-[90vw] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-xs shadow-lg"
        >
          {matches.length === 0 && <div className="px-3 py-2 text-[var(--muted)]">No products match.</div>}
          {matches.map((p, i) => (
            <div
              key={p.id}
              // mousedown (not click) so it fires before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p.id);
              }}
              onMouseEnter={() => setActive(i)}
              data-active={i === active ? "1" : undefined}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-[#e8effd]" : ""} ${p.id === value ? "font-semibold" : ""}`}
            >
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
