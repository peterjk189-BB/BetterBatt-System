"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { insuranceStatus, setInsuranceReminders, TONE_STYLES } from "@/lib/subInsurance";
import type { Attachment, Subcontractor } from "./SubcontractorPanel";

export const INSURANCE_CATEGORY = "Insurance Certificate";

const inputCls = "rounded-lg border border-[var(--border)] px-3 py-2";

function friendly(m: string) {
  return /check constraint|column|schema cache|does not exist/i.test(m)
    ? `${m} — the database hasn't been updated yet. Run the 0026 SQL in Supabase (SQL Editor), then try again.`
    : m;
}

function fmt(d: string | null | undefined) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default function SubInsurance({
  subcontractor,
  files,
  onFiles,
  onSubcontractorChange,
}: {
  subcontractor: Subcontractor;
  files: Attachment[];
  onFiles: (next: Attachment[]) => void;
  onSubcontractorChange?: (s: Subcontractor) => void;
}) {
  const supabase = createClient();
  const input = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    insurance_insurer: subcontractor.insurance_insurer || "",
    insurance_policy: subcontractor.insurance_policy || "",
    insurance_cover: subcontractor.insurance_cover != null ? String(subcontractor.insurance_cover) : "",
    insurance_expiry: subcontractor.insurance_expiry || "",
  });
  const [busy, setBusy] = useState<"" | "uploading" | "reading" | "saving">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const certs = files.filter((f) => f.category === INSURANCE_CATEGORY);
  const status = insuranceStatus(form.insurance_expiry || null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = certs.filter((c) => !urls[c.id]);
      for (const c of missing) {
        const { data } = await supabase.storage.from("attachments").createSignedUrl(c.storage_path, 3600);
        if (!cancelled && data?.signedUrl) setUrls((u) => ({ ...u, [c.id]: data.signedUrl }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  async function persist(next: typeof form, label: string) {
    setBusy("saving");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const payload = {
      insurance_insurer: next.insurance_insurer.trim() || null,
      insurance_policy: next.insurance_policy.trim() || null,
      insurance_cover: next.insurance_cover ? Number(next.insurance_cover) : null,
      insurance_expiry: next.insurance_expiry || null,
    };
    const { error } = await supabase.from("subcontractors").update(payload).eq("id", subcontractor.id);
    if (error) {
      setBusy("");
      setMsg({ ok: false, text: friendly(error.message) });
      return;
    }
    onSubcontractorChange?.({ ...subcontractor, ...payload });
    let reminder = "";
    if (user) {
      const e = await setInsuranceReminders(supabase, subcontractor, payload.insurance_expiry, user.id);
      reminder = e
        ? ` (couldn't set reminders: ${e})`
        : payload.insurance_expiry
        ? " Reminders set for 30 and 7 days before it expires."
        : "";
    }
    setBusy("");
    setMsg({ ok: true, text: `${label}${reminder}` });
  }

  // Save whatever was typed when the person clicks out of a field, so it isn't lost.
  function autosave() {
    const saved = {
      insurance_insurer: subcontractor.insurance_insurer || "",
      insurance_policy: subcontractor.insurance_policy || "",
      insurance_cover: subcontractor.insurance_cover != null ? String(subcontractor.insurance_cover) : "",
      insurance_expiry: subcontractor.insurance_expiry || "",
    };
    if (busy === "" && JSON.stringify(saved) !== JSON.stringify(form)) persist(form, "Insurance details saved.");
  }

  async function upload(file: File) {
    setMsg(null);
    setBusy("uploading");
    const path = `subcontractors/${subcontractor.id}/insurance-certificate/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
    if (upErr) {
      setBusy("");
      return setMsg({ ok: false, text: friendly(upErr.message) });
    }
    const { data, error } = await supabase
      .from("attachments")
      .insert({ subcontractor_id: subcontractor.id, category: INSURANCE_CATEGORY, storage_path: path, file_name: file.name })
      .select()
      .single();
    if (error || !data) {
      setBusy("");
      return setMsg({ ok: false, text: friendly(error?.message || "Couldn't save the file.") });
    }
    onFiles([data as Attachment, ...files]);

    // Try to read the certificate so the expiry doesn't have to be typed.
    setBusy("reading");
    let next = form;
    let readNote = "";
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/read-certificate", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.expiry_date) {
        next = {
          insurance_insurer: j.insurer || form.insurance_insurer,
          insurance_policy: j.policy_number || form.insurance_policy,
          insurance_cover: j.cover_amount != null ? String(j.cover_amount) : form.insurance_cover,
          insurance_expiry: j.expiry_date,
        };
        setForm(next);
        readNote = "Read from the certificate — check the details below. ";
      } else if (j.error === "not_configured") {
        readNote = "Automatic reading isn't switched on yet, so enter the expiry date below. ";
      } else if (j.error === "too_large") {
        readNote = "File is too big to read automatically (over 4MB) — enter the expiry date below. ";
      } else {
        readNote = "Couldn't read an expiry date from that file — enter it below. ";
      }
    } catch {
      readNote = "Couldn't read the certificate — enter the expiry date below. ";
    }
    if (next.insurance_expiry && next !== form) {
      await persist(next, `Certificate uploaded. ${readNote}`);
    } else {
      setBusy("");
      setMsg({ ok: !readNote.startsWith("Couldn"), text: `Certificate uploaded. ${readNote}` });
    }
  }

  async function view(a: Attachment) {
    const url = urls[a.id];
    if (url) window.open(url, "_blank");
  }

  async function remove(a: Attachment) {
    if (!confirm(`Remove ${a.file_name || "this certificate"}?`)) return;
    await supabase.storage.from("attachments").remove([a.storage_path]);
    const { error } = await supabase.from("attachments").delete().eq("id", a.id);
    if (!error) onFiles(files.filter((x) => x.id !== a.id));
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Public liability insurance</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_STYLES[status.tone]}`}>
          {status.label}
          {status.tone !== "none" && form.insurance_expiry ? ` · ${fmt(form.insurance_expiry)}` : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Upload the certificate of currency. We read the expiry date and set reminders for 30 and 7 days before it runs out.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => input.current?.click()}
          disabled={busy !== ""}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy === "uploading" ? "Uploading…" : busy === "reading" ? "Reading certificate…" : certs.length ? "Upload renewed certificate" : "Upload certificate"}
        </button>
        {certs.map((c) => (
          <span key={c.id} className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs">
            <button onClick={() => view(c)} className="max-w-[16rem] truncate text-accent hover:underline" title={c.file_name || ""}>
              {c.file_name || "Certificate"}
            </button>
            <button onClick={() => remove(c)} title="Remove" className="px-1 text-[var(--muted)] hover:text-red-700">
              &times;
            </button>
          </span>
        ))}
      </div>

      {msg && <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</div>}

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <label className="flex flex-col gap-1">
          Insurer
          <input className={inputCls} value={form.insurance_insurer} onChange={(e) => setForm({ ...form, insurance_insurer: e.target.value })} onBlur={() => autosave()} />
        </label>
        <label className="flex flex-col gap-1">
          Policy number
          <input className={inputCls} value={form.insurance_policy} onChange={(e) => setForm({ ...form, insurance_policy: e.target.value })} onBlur={() => autosave()} />
        </label>
        <label className="flex flex-col gap-1">
          Cover ($)
          <input className={inputCls} inputMode="numeric" value={form.insurance_cover} onChange={(e) => setForm({ ...form, insurance_cover: e.target.value.replace(/[^\d.]/g, "") })} onBlur={() => autosave()} placeholder="e.g. 20000000" />
        </label>
        <label className="flex flex-col gap-1">
          Expiry date
          <input type="date" className={inputCls} value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} onBlur={() => autosave()} />
        </label>
      </div>
      <button
        onClick={() => persist(form, "Insurance details saved.")}
        disabled={busy !== ""}
        className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-60"
      >
        {busy === "saving" ? "Saving…" : "Save insurance & set reminders"}
      </button>
    </div>
  );
}
