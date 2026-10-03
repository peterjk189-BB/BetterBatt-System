"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VisitPhoto } from "@/lib/siteVisit";
import SitePlanSketch, { type SketchBackground } from "./SitePlanSketch";

const CAPTION_SUGGESTIONS = [
  "Plans",
  "Living",
  "Dining",
  "Kitchen",
  "Bedroom",
  "Hallway",
  "Ceiling space",
  "Roof",
  "Manhole / access",
  "Entry to underfloor",
  "Tight access",
  "Not installing",
  "Existing insulation",
  "Downlights",
  "Meter box",
];

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
    return file; // unknown format: upload the original rather than fail
  }
}

export default function SiteVisitPhotos({
  initial,
  ensureVisitId,
}: {
  initial: VisitPhoto[];
  /** Saves the visit first if it's new, then returns its id. Null if it couldn't be saved. */
  ensureVisitId: () => Promise<string | null>;
}) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<VisitPhoto[]>(initial);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<VisitPhoto | null>(null);
  const [sketch, setSketch] = useState<SketchBackground | null>(null);
  const [pickingBackground, setPickingBackground] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const planUploadRef = useRef<HTMLInputElement>(null);

  // Signed URLs for any photo we don't have one for yet (the bucket is private).
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

  async function uploadBlob(visitId: string, blob: Blob, category: VisitPhoto["category"], caption: string, fileName: string) {
    const path = `site-visits/${visitId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, blob, { contentType: "image/jpeg" });
    if (upErr) throw new Error(upErr.message);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error: rowErr } = await supabase
      .from("attachments")
      .insert({
        site_visit_id: visitId,
        category,
        storage_path: path,
        file_name: fileName,
        caption: caption || null,
        sort_order: photos.length,
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
    setPhotos((p) => [...p, data as VisitPhoto]);
  }

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (files.length === 0) return;
    setError(null);
    const visitId = await ensureVisitId();
    if (!visitId) {
      setError("Add a customer name or address and save the visit before adding photos.");
      return;
    }
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const blob = await compressImage(files[i]);
        await uploadBlob(visitId, blob, "Photo", "", files[i].name);
      } catch {
        failed++;
      }
    }
    setProgress(null);
    if (failed) setError(`${failed} photo${failed === 1 ? "" : "s"} didn't upload. Check the signal and try those again.`);
  }

  async function saveCaption(p: VisitPhoto, caption: string) {
    if ((p.caption || "") === caption) return;
    setPhotos((list) => list.map((x) => (x.id === p.id ? { ...x, caption } : x)));
    await supabase.from("attachments").update({ caption: caption || null }).eq("id", p.id);
  }

  async function removePhoto(p: VisitPhoto) {
    if (!confirm(`Delete this ${p.category === "Site plan" ? "site plan" : "photo"}${p.caption ? ` (“${p.caption}”)` : ""}?`)) return;
    await supabase.storage.from("attachments").remove([p.storage_path]);
    const { error: delErr } = await supabase.from("attachments").delete().eq("id", p.id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    setPhotos((list) => list.filter((x) => x.id !== p.id));
    setViewing(null);
  }

  async function startSketchFrom(p: VisitPhoto) {
    setPickingBackground(false);
    const { data, error: dlErr } = await supabase.storage.from("attachments").download(p.storage_path);
    if (dlErr || !data) {
      setError("Couldn't open that photo to draw on. Try again.");
      return;
    }
    setSketch({ kind: "blob", blob: data });
  }

  async function saveSketch(jpeg: Blob) {
    const visitId = await ensureVisitId();
    if (!visitId) {
      setError("Add a customer name or address and save the visit before adding a site plan.");
      return;
    }
    try {
      await uploadBlob(visitId, jpeg, "Site plan", "Site plan", "site-plan.jpg");
      setSketch(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const plans = photos.filter((p) => p.category === "Site plan");
  const sitePhotos = photos.filter((p) => p.category !== "Site plan");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="rounded-lg bg-[#201f1c] px-4 py-3 text-sm font-semibold text-white"
        >
          Take photo
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold"
        >
          Add from library
        </button>
        <button
          type="button"
          onClick={() => setPickingBackground(true)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold"
        >
          Draw site plan
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input
          ref={planUploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            setPickingBackground(false);
            if (f) setSketch({ kind: "blob", blob: f });
          }}
        />
      </div>

      {progress && <p className="text-sm font-medium text-[var(--brand-gold-dark)]">{progress}</p>}
      {error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}

      {pickingBackground && (
        <div className="rounded-xl border border-[var(--border)] bg-[#f6f5f2] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Draw the site plan on…</p>
            <button onClick={() => setPickingBackground(false)} className="text-sm text-[var(--muted)] underline">
              Cancel
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setPickingBackground(false); setSketch({ kind: "blank" }); }} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
              Blank grid
            </button>
            <button onClick={() => planUploadRef.current?.click()} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
              Photo of the plans (camera or library)
            </button>
          </div>
          {sitePhotos.length > 0 && (
            <>
              <p className="mb-1.5 mt-3 text-xs uppercase tracking-wide text-[var(--muted)]">Or one of this visit&apos;s photos</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {sitePhotos.map((p) => (
                  <button key={p.id} onClick={() => startSketchFrom(p)} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[p.storage_path]} alt={p.caption || "Photo"} className="h-20 w-20 rounded-lg object-cover" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {plans.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Site plan</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <PhotoCard key={p.id} photo={p} url={urls[p.storage_path]} onOpen={() => setViewing(p)} onCaption={(c) => saveCaption(p, c)} />
            ))}
          </div>
        </div>
      )}

      {sitePhotos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sitePhotos.map((p) => (
            <PhotoCard key={p.id} photo={p} url={urls[p.storage_path]} onOpen={() => setViewing(p)} onCaption={(c) => saveCaption(p, c)} />
          ))}
        </div>
      ) : (
        plans.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            No photos yet. Photograph the plans, each area you&apos;re quoting, the access points and anything you
            won&apos;t be installing, then caption each one.
          </p>
        )
      )}

      <datalist id="photo-captions">
        {CAPTION_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setViewing(null)}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}>
            <span className="truncate text-sm">{viewing.caption || "Photo"}</span>
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
            <img src={urls[viewing.storage_path]} alt={viewing.caption || "Photo"} className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}

      {sketch && <SitePlanSketch background={sketch} onCancel={() => setSketch(null)} onSave={saveSketch} />}
    </div>
  );
}

function PhotoCard({
  photo,
  url,
  onOpen,
  onCaption,
}: {
  photo: VisitPhoto;
  url: string | undefined;
  onOpen: () => void;
  onCaption: (caption: string) => void;
}) {
  const [caption, setCaption] = useState(photo.caption || "");
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <button type="button" onClick={onOpen} className="block aspect-[3/4] w-full bg-[#f1f0ed]" style={photo.category === "Site plan" ? { aspectRatio: "4 / 3" } : undefined}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={caption || "Site photo"} className={`h-full w-full ${photo.category === "Site plan" ? "object-contain" : "object-cover"}`} />
        ) : (
          <span className="text-xs text-[var(--muted)]">Loading…</span>
        )}
      </button>
      <input
        value={caption}
        list="photo-captions"
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => onCaption(caption.trim())}
        placeholder="Caption, e.g. Living"
        className="w-full border-t border-[var(--border)] px-2.5 py-2 text-sm outline-none focus:bg-[#fffaf0]"
        aria-label="Photo caption"
      />
    </div>
  );
}
