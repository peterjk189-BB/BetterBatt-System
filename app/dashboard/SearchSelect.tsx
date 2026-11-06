"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

type Option = { id: string; label: string };

/** A dropdown you can type into to find an entry (customers, quotes...). Words match in any order. */
export default function SearchSelect({
  options,
  value,
  onChange,
  emptyLabel = "Choose...",
  placeholder = "Type to search...",
  className = "",
}: {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
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
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 4, width: r.width });
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
    const list = words.length
      ? options.filter((o) => {
          const n = o.label.toLowerCase();
          return words.every((w) => n.includes(w)) || (q.length >= 2 && squash(o.label).includes(q));
        })
      : options;
    return emptyLabel && !words.length ? [{ id: "", label: emptyLabel }, ...list] : list;
  }, [options, query, emptyLabel]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
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
          style={{ position: "fixed", left: pos.left, top: pos.top, width: Math.max(pos.width, 260) }}
          className="z-50 max-h-64 max-w-[92vw] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-lg"
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
              ref={(el) => {
                if (el && i === active) el.scrollIntoView({ block: "nearest" });
              }}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-[#e8effd] text-black" : ""} ${o.id === value ? "font-semibold" : ""}`}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
