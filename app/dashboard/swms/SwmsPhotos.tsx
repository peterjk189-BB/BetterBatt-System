"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SwmsPhoto } from "@/lib/swms";

/** Phone photos are 3–6 MB; shrink to 1600px JPEG before upload so uploads work on site on 4G. */
async function compressImage(file: File): Promise<Blob> {
  try {
    let source: CanvasImageSource;
    let w: number;
    let h: number;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      source = bmp;
      w = bmp.width;
      h = bmp.height;
    } catch {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      URL.revokeObjectURL(url);
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    }
    const scale = Math.min(1, 1600 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

export default function SwmsPhotos({
  initial,
  ensureSwmsId,
}: {
  initial: SwmsPhoto[];
  /** Saves the SWMS first if it's new, then returns its id. Null if it couldn't be saved. */
  ensureSwmsId: () => Promise<string | null>;
}) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<SwmsPhoto[]>(initial);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SwmsPhoto | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const missing = photos.filter((p) => !urls[p.storage_path]).map((p) => p.storage_path);
    if (missing.length === 0) return;
    supabase.storage
      .from("attachments")
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        const next: Record<string, string> = {};
        for (const s of data ?? []) if (s.path && s.signedUrl) next[s.path] = s.signedUrl;
        setUrls((u) => ({ ...u, ...next }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (files.length === 0) return;
    setError(null);
    const swmsId = await ensureSwmsId();
    if (!swmsId) {
      setError("Fill in the job date and site address and save before adding photos.");
      return;
    }
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const blob = await compressImage(files[i]);
        const path = `swms/${swmsId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: upErr } = await supabase.storage.from("attachments").upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw new Error(upErr.message);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error: rowErr } = await supabase
          .from("attachments")
          .insert({
            swms_id: swmsId,
            category: "SWMS",
            storage_path: path,
            file_name: files[i].name,
            sort_order: photos.length + i,
            uploaded_by: user?.id ?? null,
          })
          .select("id, category, storage_path, file_name, caption, sort_order, created_at")
          .single();
        if (rowErr || !data) {
          await supabase.storage.from("attachments").remove([path]);
          throw new Error(rowErr?.message || "Could not save the photo.");
        }
        const objectUrl = URL.createObjectURL(blob);
        setUrls((u) => ({ ...u, [path]: objectUrl }));
        setPhotos((p) => [...p, data as SwmsPhoto]);
      } catch {
        failed++;
      }
    }
    setProgress(null);
    if (failed) setError(`${failed} photo${failed === 1 ? "" : "s"} didn't upload. Check the signal and try those again.`);
  }

  async function removePhoto(p: SwmsPhoto) {
    if (!confirm("Delete this photo?")) return;
    await supabase.storage.from("attachments").remove([p.storage_path]);
    const { error: delErr } = await supabase.from("attachments").delete().eq("id", p.id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    setPhotos((list) => list.filter((x) => x.id !== p.id));
    setViewing(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => cameraRef.current?.click()} className="rounded-lg bg-[#201f1c] px-4 py-3 text-sm font-semibold text-white">
          Take photo
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold"
        >
          Add from library
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {progress && <p className="text-sm font-medium text-[var(--brand-gold-dark)]">{progress}</p>}
      {error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewing(p)}
              className="aspect-[3/4] overflow-hidden rounded-xl border border-[var(--border)] bg-[#f1f0ed]"
            >
              {urls[p.storage_path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[p.storage_path]} alt="Site photo" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-[var(--muted)]">Loading…</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          No photos yet. Photograph before/after and any hazards found.
        </p>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setViewing(null)}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}>
            <span className="truncate text-sm">Photo</span>
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removePhoto(viewing);
                }}
                className="rounded-lg border border-red-400/60 px-3 py-1.5 text-sm text-red-200"
              >
                Delete
              </button>
              <button className="rounded-lg border border-white/30 px-3 py-1.5 text-sm">Close</button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[viewing.storage_path]} alt="Site photo" className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
