"use client";

import { useState } from "react";

export default function CompanyDetailsForm({ initialAbn, initialPhone }: { initialAbn: string; initialPhone: string }) {
  const [abn, setAbn] = useState(initialAbn);
  const [phone, setPhone] = useState(initialPhone);
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
        body: JSON.stringify({ abn, company_phone: phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(
          /abn|company_phone/.test(data.error || "")
            ? "The database needs the certificate update first — run migration 0024 in Supabase, then save again."
            : data.error || "Something went wrong"
        );
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
      <h2 className="font-semibold">Business details on certificates</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">Printed in the header of every insulation certificate.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">ABN</span>
          <input
            value={abn}
            onChange={(e) => {
              setAbn(e.target.value);
              setStatus("idle");
            }}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Phone</span>
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setStatus("idle");
            }}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
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
