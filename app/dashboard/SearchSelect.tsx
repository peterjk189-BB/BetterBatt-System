"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

type Option = { id: string; label: string };

/** A dropdown you can type into to find an entry (customers, quotes...). Words match in any order. */
export default function SearchSelect({
  options,
  value,
  onChange,
  pinned,
  emptyLabel = "Choose...",
  placeholder = "Type to search...",
  className = "",
}: {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  /** An action entry (e.g. "+ Add new customer") kept at the very top of the list, whatever is typed. */
  pinned?: Option;
  /** Label of the "nothing selected" entry (shown at the top of the list); leave "" to hide it. */
  emptyLabel?: string;
  placeholder?: string;
  /** Classes for the text box (so it matches the form's other inputs). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const keyNav = useRef(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function place(ev?: Event) {
      // Scrolling the list itself must not re-place it (that re-rendered and snapped the list back to the top).
      if (ev && ev.target instanceof Node && listRef.current?.contains(ev.target)) return;
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setPos((cur) => (cur && cur.left === r.left && cur.top === r.bottom + 4 && cur.width === r.width ? cur : { left: r.left, top: r.bottom + 4, width: r.width }));
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value);
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = squash(query);
    // Names that START with what you've typed come first, then names with a word starting with it, then the rest.
    const rank = (label: string) => {
      const n = label.toLowerCase();
      if (n.startsWith(words.join(" "))) return 0;
      if (words.every((w) => n.startsWith(w) || n.includes(" " + w))) return 1;
      return 2;
    };
    const list = words.length
      ? options
          .filter((o) => {
            const n = o.label.toLowerCase();
            return words.every((w) => n.includes(w)) || (q.length >= 2 && squash(o.label).includes(q));
          })
          .map((o, i) => ({ o, i, r: rank(o.label) }))
          .sort((a, b) => a.r - b.r || a.i - b.i)
          .map((x) => x.o)
      : options;
    const withEmpty = emptyLabel && !words.length ? [{ id: "", label: emptyLabel }, ...list] : list;
    return pinned ? [pinned, ...withEmpty.filter((o) => o.id !== pinned.id)] : withEmpty;
  }, [options, query, emptyLabel, pinned]);

  // Keep the highlighted row visible only while using the arrow keys (not on every render / touch scroll).
  useEffect(() => {
    if (!open || !keyNav.current) return;
    keyNav.current = false;
    listRef.current?.querySelector<HTMLElement>('[data-active="1"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(id: string) {
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
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        value={open ? query : selected?.label ?? ""}
        placeholder={open ? selected?.label || placeholder : emptyLabel && !selected ? emptyLabel : placeholder}
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
        className={className}
      />
      {open && pos && (
        <div
          ref={listRef}
          style={{ position: "fixed", left: pos.left, top: pos.top, width: Math.max(pos.width, 260), WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
          className="z-50 max-h-[45vh] max-w-[92vw] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-lg"
        >
          {matches.length === 0 && <div className="px-3 py-2 text-[var(--muted)]">Nothing matches.</div>}
          {matches.map((o, i) => (
            <div
              key={o.id || "none"}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.id);
              }}
              onMouseEnter={() => setActive(i)}
              data-active={i === active ? "1" : undefined}
              className={`cursor-pointer px-3 py-1.5 ${pinned && o.id === pinned.id ? "font-semibold text-accent " : ""}${i === active ? "bg-[#e8effd] text-black" : ""} ${o.id === value ? "font-semibold" : ""}`}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
