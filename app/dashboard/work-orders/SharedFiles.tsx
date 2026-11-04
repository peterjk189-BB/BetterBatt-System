"use client";

import { useState } from "react";
import PhotoViewer from "../PhotoViewer";

export type SharedFile = { id: string; name: string; path: string; pdf: boolean; url: string };

/** Plans and photos the office shared from the quote. Pictures open full-size with arrows; PDFs open in a new tab. */
export default function SharedFiles({ files }: { files: SharedFile[] }) {
  const [viewing, setViewing] = useState<string | null>(null);
  if (files.length === 0) return null;
  const images = files.filter((f) => !f.pdf);
  const urls = Object.fromEntries(files.map((f) => [f.path, f.url]));
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Plans &amp; files from the office</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {files.map((f) =>
          f.pdf ? (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="flex h-24 w-24 flex-col items-center justify-center gap-0.5 rounded-lg border border-[var(--border)] bg-[#f1f0ed] px-1 text-center text-black">
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
              <span className="line-clamp-2 break-all text-[9px] leading-tight">{f.name}</span>
            </a>
          ) : (
            <button key={f.id} type="button" onClick={() => setViewing(f.id)} className="h-24 w-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[#f1f0ed]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
            </button>
          )
        )}
      </div>
      {viewing && (
        <PhotoViewer
          photos={images.map((f) => ({ id: f.id, storage_path: f.path, caption: f.name }))}
          urls={urls}
          currentId={viewing}
          onChange={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
