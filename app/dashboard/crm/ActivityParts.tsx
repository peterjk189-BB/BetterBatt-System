"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** A text box that grows as you type. Enter adds a new line; Ctrl/Cmd+Enter submits. */
export function AutoTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  className = "",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      autoFocus={autoFocus}
      className={`resize-none overflow-hidden ${className}`}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
      }}
    />
  );
}

/** One logged contact with an Edit button, so a saved note can be added to or corrected. */
export function EditableNote({
  id,
  note,
  onSaved,
  inputCls,
}: {
  id: string;
  note: string;
  onSaved: (id: string, note: string) => void;
  inputCls: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!text.trim()) return setErr("The note can't be empty.");
    setBusy(true);
    setErr("");
    const supabase = createClient();
    const { data, error } = await supabase.from("crm_activity").update({ note: text.trim() }).eq("id", id).select("id");
    setBusy(false);
    if (error) return setErr(error.message);
    if (!data || data.length === 0) return setErr("Not saved (no permission to edit this note?).");
    onSaved(id, text.trim());
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="whitespace-pre-wrap">{note}</div>
        <button type="button" onClick={() => { setText(note); setEditing(true); }} className="shrink-0 text-xs text-accent hover:underline">
          Edit
        </button>
      </div>
    );
  }
  return (
    <div className="mt-1 grid gap-2">
      <AutoTextarea className={inputCls} value={text} onChange={setText} onSubmit={save} autoFocus />
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-[#201f1c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
