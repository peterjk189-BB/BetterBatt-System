"use client";

import { useState } from "react";

export default function SettingsForm({ initialTerms }: { initialTerms: string }) {
  const [terms, setTerms] = useState(initialTerms);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function save() {
    setSaving(true);
    setStatus("idle");
    setErrorMsg("");
    try {
      const res = await fetch("/api/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms_and_conditions: terms }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong");
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
      <h2 className="font-semibold">Quote terms &amp; conditions</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        This text is printed automatically at the bottom of every quote&apos;s print preview and PDF download.
        Separate paragraphs with a blank line.
      </p>

      <textarea
        value={terms}
        onChange={(e) => {
          setTerms(e.target.value);
          setStatus("idle");
        }}
        rows={16}
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-white p-3 font-mono text-sm leading-relaxed"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {status === "saved" && <span className="text-sm text-green-700">Saved.</span>}
        {status === "error" && <span className="text-sm text-red-700">{errorMsg}</span>}
      </div>
    </div>
  );
}
