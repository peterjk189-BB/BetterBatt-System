"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PhotoViewer from "../PhotoViewer";

type FileRow = { id: string; category: string; storage_path: string; file_name: string | null; caption: string | null; created_at: string };

const isPdf = (f: { file_name?: string | null; storage_path: string }) => /\.pdf$/i.test(f.file_name || f.storage_path);

/** Shrinks phone photos to a 1600px JPEG before upload. */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Plans, emails, photos or PDFs attached to a quote. Pictures show as thumbnails and open full-size with arrows; PDFs open in a new tab. */
export default function QuoteFiles({ projectId }: { projectId: string | null }) {
  const supabase = createClient();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) return;
    supabase
      .from("attachments")
      .select("id, category, storage_path, file_name, caption, created_at")
      .eq("project_id", projectId)
      .is("work_order_id", null)
      .in("category", ["Photo", "Other document"])
      .order("created_at")
      .then(({ data }) => setFiles((data ?? []) as FileRow[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const missing = files.filter((f) => !urls[f.storage_path]).map((f) => f.storage_path);
    if (!missing.length) return;
    supabase.storage
      .from("attachments")
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        const next: Record<string, string> = {};
        for (const s of data ?? []) if (s.path && s.signedUrl) next[s.path] = s.signedUrl;
        setUrls((u) => ({ ...u, ...next }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  async function add(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length || !projectId) return;
    setError(null);
    let failed = 0;
    for (let i = 0; i < picked.length; i++) {
      const f = picked[i];
      setBusy(`Uploading ${i + 1} of ${picked.length}…`);
      try {
        const pdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
        const image = f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);
        if (!pdf && !image) throw new Error("Only pictures and PDFs");
        if (f.size > 25 * 1024 * 1024) throw new Error("Too large (max 25 MB)");
        const body = image ? await compress(f) : f;
        const path = `quotes/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${image ? "jpg" : "pdf"}`;
        const { error: upErr } = await supabase.storage.from("attachments").upload(path, body, { contentType: image ? "image/jpeg" : "application/pdf" });
        if (upErr) throw new Error(upErr.message);
        const { data: u } = await supabase.auth.getUser();
        const { data, error: rowErr } = await supabase
          .from("attachments")
          .insert({ project_id: projectId, category: image ? "Photo" : "Other document", storage_path: path, file_name: f.name, uploaded_by: u.user?.id ?? null })
          .select("id, category, storage_path, file_name, caption, created_at")
          .single();
        if (rowErr || !data) {
          await supabase.storage.from("attachments").remove([path]);
          throw new Error(rowErr?.message || "Could not save");
        }
        setFiles((cur) => [...cur, data as FileRow]);
      } catch {
        failed++;
      }
    }
    setBusy(null);
    if (failed) setError(`${failed} file${failed === 1 ? "" : "s"} didn't upload. Only pictures and PDFs up to 25 MB can be attached.`);
  }

  async function remove(id: string) {
    const f = files.find((x) => x.id === id);
    if (!f) return;
    await supabase.storage.from("attachments").remove([f.storage_path]);
    const { error: delErr } = await supabase.from("attachments").delete().eq("id", id);
    if (delErr) return setError(delErr.message);
    setFiles((cur) => cur.filter((x) => x.id !== id));
    setConfirmId(null);
    setViewing(null);
  }

  const images = files.filter((f) => !isPdf(f));

  return (
    <div className="sm:col-span-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Attachments</span>
        <span className="text-xs text-[var(--muted)]">(plans, emails, photos or PDFs — for the office, not shown to the customer)</span>
        <button
          type="button"
          disabled={!projectId || !!busy}
          onClick={() => pick.current?.click()}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-60"
        >
          {busy ?? "+ Attach file"}
        </button>
        <input ref={pick} type="file" multiple accept="image/*,application/pdf,.pdf" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {!projectId && <p className="mt-1 text-xs text-[var(--muted)]">Save the quote first, then you can attach files.</p>}
      {error && <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

      {files.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
          {files.map((f) => {
            const pdf = isPdf(f);
            return (
              <div key={f.id} className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                {pdf ? (
                  <a
                    href={urls[f.storage_path] || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="flex aspect-[3/4] flex-col items-center justify-center gap-1 bg-[#f1f0ed] px-2 text-center text-black hover:bg-[#e8e6e1]"
                  >
                    <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">PDF</span>
                    <span className="line-clamp-3 break-all text-[11px]">{f.file_name || "Document"}</span>
                  </a>
                ) : (
                  <button type="button" onClick={() => setViewing(f.id)} className="flex aspect-[3/4] items-center justify-center bg-[#f1f0ed]">
                    {urls[f.storage_path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[f.storage_path]} alt={f.file_name || "Attachment"} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-[var(--muted)]">Loading…</span>
                    )}
                  </button>
                )}
                <div className="flex items-center justify-between gap-1 border-t border-[var(--border)] px-2 py-1 text-[11px]">
                  <span className="truncate text-[var(--muted)]" title={f.file_name || ""}>{f.file_name || (pdf ? "PDF" : "Photo")}</span>
                  {confirmId === f.id ? (
                    <span className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => remove(f.id)} className="font-semibold text-red-700">Yes, delete</button>
                      <button type="button" onClick={() => setConfirmId(null)} className="text-[var(--muted)]">Cancel</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(f.id)} className="shrink-0 text-[var(--muted)] hover:text-red-700" aria-label="Delete file">Delete</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewing && (
        <PhotoViewer
          photos={images.map((f) => ({ id: f.id, storage_path: f.storage_path, caption: f.file_name }))}
          urls={urls}
          currentId={viewing}
          onChange={setViewing}
          onClose={() => setViewing(null)}
          onDelete={(id) => remove(id)}
        />
      )}
    </div>
  );
}
