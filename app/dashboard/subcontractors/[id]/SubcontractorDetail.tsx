"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Subcontractor = {
  id: string;
  name: string;
  company_name: string | null;
  address: string | null;
  postcode: string | null;
  phone: string | null;
  home_phone: string | null;
  email: string | null;
  abn: string | null;
  commencement_date: string | null;
  finished_date: string | null;
  notes: string | null;
  active: boolean;
  archived: boolean;
};

type Attachment = {
  id: string;
  category: string;
  storage_path: string;
  file_name: string | null;
  created_at: string;
};

const DOC_CATEGORIES = ["White Card", "Photo ID", "Driver's Licence"] as const;

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SubcontractorDetail({
  subcontractor,
  attachments,
}: {
  subcontractor: Subcontractor;
  attachments: Attachment[];
}) {
  const supabase = createClient();
  const [form, setForm] = useState({
    name: subcontractor.name,
    company_name: subcontractor.company_name || "",
    address: subcontractor.address || "",
    postcode: subcontractor.postcode || "",
    phone: subcontractor.phone || "",
    home_phone: subcontractor.home_phone || "",
    email: subcontractor.email || "",
    abn: subcontractor.abn || "",
    commencement_date: subcontractor.commencement_date || "",
    finished_date: subcontractor.finished_date || "",
    notes: subcontractor.notes || "",
    active: subcontractor.active,
  });
  const [archived, setArchived] = useState(subcontractor.archived);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [files, setFiles] = useState(attachments);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function save() {
    setSaving(true);
    const payload = {
      ...form,
      commencement_date: form.commencement_date || null,
      finished_date: form.finished_date || null,
    };
    const { error } = await supabase.from("subcontractors").update(payload).eq("id", subcontractor.id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  async function toggleArchive() {
    if (!archived && !confirm(`Archive ${subcontractor.name}?`)) return;
    const { error } = await supabase
      .from("subcontractors")
      .update({ archived: !archived })
      .eq("id", subcontractor.id);
    if (!error) setArchived((v) => !v);
  }

  function slug(category: string) {
    return category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  async function uploadFile(category: string, file: File) {
    setUploading(category);
    const path = `subcontractors/${subcontractor.id}/${slug(category)}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
    if (upErr) {
      alert(upErr.message);
      setUploading(null);
      return;
    }
    const { data, error } = await supabase
      .from("attachments")
      .insert({
        subcontractor_id: subcontractor.id,
        category,
        storage_path: path,
        file_name: file.name,
      })
      .select()
      .single();
    if (!error && data) {
      setFiles((prev) => [data as Attachment, ...prev]);
    } else if (error) {
      alert(error.message);
    }
    setUploading(null);
  }

  async function viewFile(a: Attachment) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(a.storage_path, 60);
    if (error || !data?.signedUrl) {
      alert(error?.message || "Could not open file.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function removeFile(a: Attachment) {
    if (!confirm(`Remove ${a.file_name || "this file"}?`)) return;
    await supabase.storage.from("attachments").remove([a.storage_path]);
    const { error } = await supabase.from("attachments").delete().eq("id", a.id);
    if (!error) setFiles((prev) => prev.filter((x) => x.id !== a.id));
  }

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/subcontractors" className="text-sm text-[var(--muted)] hover:underline">
        &larr; Back to subcontractors
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{subcontractor.name}</h1>
          {subcontractor.company_name && (
            <p className="text-sm text-[var(--muted)]">{subcontractor.company_name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {savedMsg && <span className="text-sm text-green-700">Saved</span>}
          <button onClick={toggleArchive} className="text-sm text-[var(--muted)] underline">
            {archived ? "Restore" : "Archive"}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Details</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Company
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm">
            Address
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Postcode
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.postcode}
              onChange={(e) => setForm({ ...form, postcode: e.target.value })}
            />
          </label>
          <div />
          <label className="flex flex-col gap-1 text-sm">
            Mobile
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Home phone
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.home_phone}
              onChange={(e) => setForm({ ...form, home_phone: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ABN
            <input
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.abn}
              onChange={(e) => setForm({ ...form, abn: e.target.value })}
              placeholder="Leave blank if paid as an individual"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Commencement date
            <input
              type="date"
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.commencement_date}
              onChange={(e) => setForm({ ...form, commencement_date: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Finished date
            <input
              type="date"
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              value={form.finished_date}
              onChange={(e) => setForm({ ...form, finished_date: e.target.value })}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm">
            Notes
            <textarea
              className="rounded-lg border border-[var(--border)] px-3 py-2"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Documents</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Upload White Card, photo ID and driver&rsquo;s licence — stored privately, only viewable from here.
        </p>

        <div className="mt-4 space-y-5">
          {DOC_CATEGORIES.map((category) => {
            const docs = files.filter((f) => f.category === category);
            return (
              <div key={category}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{category}</h3>
                  <div>
                    <input
                      ref={(el) => {
                        fileInputs.current[category] = el;
                      }}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadFile(category, file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => fileInputs.current[category]?.click()}
                      disabled={uploading === category}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-60"
                    >
                      {uploading === category ? "Uploading..." : "Upload file"}
                    </button>
                  </div>
                </div>
                {docs.length === 0 ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">No file uploaded.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {docs.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <button onClick={() => viewFile(a)} className="text-accent hover:underline">
                          {a.file_name || "File"}
                        </button>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--muted)]">{fmtDateTime(a.created_at)}</span>
                          <button
                            onClick={() => removeFile(a)}
                            className="text-xs text-[var(--muted)] hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
