"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import SubInsurance from "./SubInsurance";
import SubWorkers from "./SubWorkers";

export type Subcontractor = {
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
  gst_registered: boolean;
  insurance_insurer?: string | null;
  insurance_policy?: string | null;
  insurance_cover?: number | null;
  insurance_expiry?: string | null;
};

export type Attachment = {
  id: string;
  category: string;
  storage_path: string;
  file_name: string | null;
  created_at: string;
};

const DOC_CATEGORIES = ["White Card", "Photo ID", "Driver's Licence"] as const;
export const PROFILE_CATEGORY = "Profile Photo";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function isImageFile(name: string | null) {
  return !!name && /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name);
}

export default function SubcontractorPanel({
  subcontractor,
  attachments,
  isAdmin,
  onSubcontractorChange,
  onAttachmentsChange,
}: {
  subcontractor: Subcontractor;
  attachments: Attachment[];
  isAdmin: boolean;
  onSubcontractorChange?: (s: Subcontractor) => void;
  onAttachmentsChange?: (files: Attachment[]) => void;
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
    gst_registered: subcontractor.gst_registered,
  });
  const [archived, setArchived] = useState(subcontractor.archived);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [files, setFiles] = useState(attachments);
  const [uploading, setUploading] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setFiles(attachments);
  }, [attachments]);

  // Fetch a viewable (signed) URL for every file so thumbnails can render straight away,
  // instead of only generating one on click.
  useEffect(() => {
    let cancelled = false;
    async function loadThumbs() {
      const missing = files.filter((f) => !thumbUrls[f.id]);
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(async (f) => {
          const { data } = await supabase.storage.from("attachments").createSignedUrl(f.storage_path, 3600);
          return [f.id, data?.signedUrl] as const;
        })
      );
      if (cancelled) return;
      setThumbUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    }
    loadThumbs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  function updateFiles(next: Attachment[]) {
    setFiles(next);
    onAttachmentsChange?.(next);
  }

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
    onSubcontractorChange?.({ ...subcontractor, ...payload, archived });
    logAudit(supabase, {
      eventType: "update",
      entityType: "subcontractor",
      entityId: subcontractor.id,
      entityLabel: form.name,
    });
  }

  async function toggleArchive() {
    if (!archived && !confirm(`Archive ${subcontractor.name}?`)) return;
    const { error } = await supabase
      .from("subcontractors")
      .update({ archived: !archived })
      .eq("id", subcontractor.id);
    if (!error) {
      setArchived((v) => !v);
      onSubcontractorChange?.({ ...subcontractor, archived: !archived });
      logAudit(supabase, {
        eventType: archived ? "update" : "delete",
        entityType: "subcontractor",
        entityId: subcontractor.id,
        entityLabel: subcontractor.name,
        details: archived ? "Restored" : "Archived",
      });
    }
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
      updateFiles([data as Attachment, ...files]);
    } else if (error) {
      alert(error.message);
    }
    setUploading(null);
  }

  // The profile photo is a single "main" image (shown next to their name on the list page),
  // so uploading a new one replaces whatever was there before rather than adding another.
  async function uploadProfilePhoto(file: File) {
    setUploading(PROFILE_CATEGORY);
    const existing = files.filter((f) => f.category === PROFILE_CATEGORY);
    for (const e of existing) {
      await supabase.storage.from("attachments").remove([e.storage_path]);
      await supabase.from("attachments").delete().eq("id", e.id);
    }
    const path = `subcontractors/${subcontractor.id}/profile-photo/${Date.now()}-${file.name}`;
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
        category: PROFILE_CATEGORY,
        storage_path: path,
        file_name: file.name,
      })
      .select()
      .single();
    if (!error && data) {
      updateFiles([data as Attachment, ...files.filter((f) => f.category !== PROFILE_CATEGORY)]);
    } else if (error) {
      alert(error.message);
    }
    setUploading(null);
  }

  async function viewFile(a: Attachment) {
    let url = thumbUrls[a.id];
    if (!url) {
      const { data, error } = await supabase.storage.from("attachments").createSignedUrl(a.storage_path, 3600);
      if (error || !data?.signedUrl) {
        alert(error?.message || "Could not open file.");
        return;
      }
      url = data.signedUrl;
    }
    window.open(url, "_blank");
  }

  async function removeFile(a: Attachment) {
    if (!confirm(`Remove ${a.file_name || "this file"}?`)) return;
    await supabase.storage.from("attachments").remove([a.storage_path]);
    const { error } = await supabase.from("attachments").delete().eq("id", a.id);
    if (!error) {
      updateFiles(files.filter((x) => x.id !== a.id));
      setThumbUrls((prev) => {
        const next = { ...prev };
        delete next[a.id];
        return next;
      });
    }
  }

  const profilePhoto = files.find((f) => f.category === PROFILE_CATEGORY);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => fileInputs.current[PROFILE_CATEGORY]?.click()}
            title="Change photo"
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[#f2f0ec]"
          >
            {profilePhoto && thumbUrls[profilePhoto.id] ? (
              <img src={thumbUrls[profilePhoto.id]} alt={subcontractor.name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-[var(--muted)]">
                {initials(subcontractor.name)}
              </span>
            )}
            <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-[10px] text-white group-hover:flex">
              {uploading === PROFILE_CATEGORY ? "..." : "Change"}
            </span>
          </button>
          <input
            ref={(el) => {
              fileInputs.current[PROFILE_CATEGORY] = el;
            }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadProfilePhoto(file);
              e.target.value = "";
            }}
          />
          <div>
            <h2 className="text-lg font-bold">{subcontractor.name}</h2>
            {subcontractor.company_name && (
              <p className="text-sm text-[var(--muted)]">{subcontractor.company_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedMsg && <span className="text-sm text-green-700">Saved</span>}
          {isAdmin && (
            <button onClick={toggleArchive} className="text-sm text-[var(--muted)] underline">
              {archived ? "Restore" : "Archive"}
            </button>
          )}
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
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Details</h3>
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.gst_registered}
              onChange={(e) => setForm({ ...form, gst_registered: e.target.checked })}
            />
            GST registered
          </label>
        </div>
      </div>

      <SubInsurance
        subcontractor={subcontractor}
        files={files}
        onFiles={updateFiles}
        onSubcontractorChange={onSubcontractorChange}
      />

      <SubWorkers subcontractorId={subcontractor.id} />

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Contractor&rsquo;s own documents</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Upload White Card, photo ID and driver&rsquo;s licence — stored privately, only viewable from here.
        </p>

        <div className="mt-4 space-y-5">
          {DOC_CATEGORIES.map((category) => {
            const docs = files.filter((f) => f.category === category);
            return (
              <div key={category}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{category}</h4>
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
                  <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {docs.map((a) => (
                      <div key={a.id} className="group relative">
                        <button
                          onClick={() => viewFile(a)}
                          title={a.file_name || "File"}
                          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[#f2f0ec] hover:border-accent"
                        >
                          {isImageFile(a.file_name) && thumbUrls[a.id] ? (
                            <img
                              src={thumbUrls[a.id]}
                              alt={a.file_name || "Photo"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex flex-col items-center gap-1 text-[var(--muted)]">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                className="h-8 w-8"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12h6m-6 4h6M9 8h1m5-5H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7l-5-4Z"
                                />
                              </svg>
                              <span className="text-[10px]">PDF</span>
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => removeFile(a)}
                          title="Remove"
                          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white group-hover:flex"
                        >
                          &times;
                        </button>
                        <p className="mt-1 truncate text-[10px] text-[var(--muted)]" title={a.file_name || ""}>
                          {fmtDateTime(a.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
