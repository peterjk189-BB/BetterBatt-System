"use client";

import { useEffect, useRef } from "react";

type P = { id: string; storage_path: string; caption?: string | null };

/** Full-screen photo viewer with previous/next arrows (also ←/→ keys and swipe), so you don't have to close one to open the next. */
export default function PhotoViewer({
  photos,
  urls,
  currentId,
  onChange,
  onClose,
  onDelete,
}: {
  photos: P[];
  urls: Record<string, string>;
  currentId: string;
  onChange: (id: string) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
}) {
  const idx = Math.max(0, photos.findIndex((p) => p.id === currentId));
  const photo = photos[idx];
  const touchX = useRef<number | null>(null);
  const go = (d: number) => {
    if (photos.length < 2) return;
    onChange(photos[(idx + d + photos.length) % photos.length].id);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, photos.length]);

  if (!photo) return null;
  const arrow = "absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-3xl leading-none text-white hover:bg-black/80";
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}>
        <span className="truncate text-sm">
          {photos.length > 1 && <span className="mr-2 tabular-nums text-white/70">{idx + 1} of {photos.length}</span>}
          {photo.caption || "Photo"}
        </span>
        <div className="flex gap-2">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(photo.id);
              }}
              className="rounded-lg border border-red-400/60 px-3 py-1.5 text-sm text-red-200"
            >
              Delete
            </button>
          )}
          <button className="rounded-lg border border-white/30 px-3 py-1.5 text-sm">Close</button>
        </div>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-3"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              className={`${arrow} left-3`}
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
            >
              &#8249;
            </button>
            <button
              type="button"
              aria-label="Next photo"
              className={`${arrow} right-3`}
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
            >
              &#8250;
            </button>
          </>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[photo.storage_path]} alt={photo.caption || "Photo"} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  );
}
