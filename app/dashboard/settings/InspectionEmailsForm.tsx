"use client";

import { useState } from "react";

export default function InspectionEmailsForm({ initial }: { initial: string }) {
  const [emails, setEmails] = useState(initial);
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
        body: JSON.stringify({ inspection_notify_emails: emails }),
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
      <h2 className="font-semibold">&ldquo;Inspection due&rdquo; emails</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        When an installer marks their SWMS as Completed, these people get an email with a link to start the inspection.
        Separate addresses with commas.
      </p>
      <input
        value={emails}
        onChange={(e) => {
          setEmails(e.target.value);
          setStatus("idle");
        }}
        placeholder="you@betterbattinsulation.com.au, allan@…"
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
      />
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save"}
        </button>
        {status === "saved" && <span className="text-sm text-green-700">Saved.</span>}
        {status === "error" && <span className="text-sm text-red-700">{errorMsg}</span>}
      </div>
    </div>
  );
}
