"use client";

import { useState } from "react";

export default function AgreementForm({ initial, standard }: { initial: string; standard: string }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // saving the untouched standard text stores nothing, so future improvements to the default still flow through
        body: JSON.stringify({ subcontractor_agreement: text.trim() === standard.trim() ? "" : text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg((data.error || "Something went wrong") + (/column|schema/i.test(data.error || "") ? " (run migration 0030 in Supabase first)" : ""));
        return;
      }
      setStatus("saved");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-semibold">Subcontractor working agreement</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Shown to new subcontractors on their onboarding link, and signed by them. Separate paragraphs with a blank line; start a line with ## for a heading.
        Changes only affect people who haven&apos;t signed yet. This is a general starting draft, so have it checked by your solicitor.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStatus("idle");
        }}
        rows={20}
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-mono text-sm leading-relaxed"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={() => {
            if (confirm("Replace the text with the standard agreement?")) {
              setText(standard);
              setStatus("idle");
            }
          }}
          className="text-sm text-[var(--muted)] underline"
        >
          Reset to standard
        </button>
        {status === "saved" && <span className="text-sm text-green-700">Saved.</span>}
        {status === "error" && <span className="text-sm text-red-700">{errorMsg}</span>}
      </div>
    </div>
  );
}
