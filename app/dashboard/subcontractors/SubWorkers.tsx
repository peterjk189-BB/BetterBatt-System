"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "./SubcontractorPanel";

type Worker = {
  id: string;
  subcontractor_id: string;
  name: string;
  phone: string | null;
  whitecard_number: string | null;
  notes: string | null;
  active: boolean;
  archived: boolean;
};
type Doc = { id: string; worker_id: string; category: string; storage_path: string; file_name: string | null; created_at: string };

const CATS = ["Photo ID", "White Card"] as const;
const inputCls = "rounded-lg border border-[var(--border)] px-3 py-2 text-sm";

function isImage(name: string | null) {
  return !!name && /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name);
}

/** The installers who work for a contractor: name, phone, White Card number, photo ID and White Card images. */
export default function SubWorkers({ subcontractorId }: { subcontractorId: string }) {
  const supabase = createClient();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [nw, setNw] = useState({ name: "", phone: "", whitecard_number: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    const { data: w, error } = await supabase
      .from("subcontractor_workers")
      .select("*")
      .eq("subcontractor_id", subcontractorId)
      .eq("archived", false)
      .order("name");
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }
    const ws = (w ?? []) as Worker[];
    setWorkers(ws);
    if (ws.length) {
      const { data: d } = await supabase
        .from("attachments")
        .select("id, worker_id, category, storage_path, file_name, created_at")
        .in("worker_id", ws.map((x) => x.id))
        .order("created_at", { ascending: false });
      setDocs((d ?? []) as Doc[]);
    } else setDocs([]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcontractorId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const d of docs.filter((x) => !urls[x.id])) {
        const { data } = await supabase.storage.from("attachments").createSignedUrl(d.storage_path, 3600);
        if (!cancelled && data?.signedUrl) setUrls((u) => ({ ...u, [d.id]: data.signedUrl }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  async function addWorker() {
    if (!nw.name.trim()) return;
    const { data, error } = await supabase
      .from("subcontractor_workers")
      .insert({
        subcontractor_id: subcontractorId,
        name: nw.name.trim(),
        phone: nw.phone.trim() || null,
        whitecard_number: nw.whitecard_number.trim() || null,
      })
      .select()
      .single();
    if (error) return setErr(error.message);
    setWorkers((p) => [...p, data as Worker].sort((a, b) => a.name.localeCompare(b.name)));
    setNw({ name: "", phone: "", whitecard_number: "" });
    setAdding(false);
    setErr(null);
  }

  async function patch(w: Worker, p: Partial<Worker>) {
    setWorkers((prev) => prev.map((x) => (x.id === w.id ? { ...x, ...p } : x)));
    const { error } = await supabase.from("subcontractor_workers").update(p).eq("id", w.id);
    if (error) setErr(error.message);
  }

  async function removeWorker(w: Worker) {
    if (!confirm(`Remove ${w.name} from this contractor's team? Their documents stay on file.`)) return;
    const { error } = await supabase.from("subcontractor_workers").update({ archived: true }).eq("id", w.id);
    if (error) return setErr(error.message);
    setWorkers((p) => p.filter((x) => x.id !== w.id));
  }

  async function upload(w: Worker, category: string, file: File) {
    setBusy(w.id + category);
    const path = `subcontractors/${subcontractorId}/workers/${w.id}/${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
    if (upErr) {
      setBusy(null);
      return setErr(upErr.message);
    }
    const { data, error } = await supabase
      .from("attachments")
      .insert({ worker_id: w.id, category, storage_path: path, file_name: file.name })
      .select("id, worker_id, category, storage_path, file_name, created_at")
      .single();
    setBusy(null);
    if (error || !data) return setErr(error?.message || "Couldn't save the file.");
    setDocs((p) => [data as Doc, ...p]);
    setErr(null);
  }

  async function removeDoc(d: Doc) {
    if (!confirm(`Remove ${d.file_name || "this file"}?`)) return;
    await supabase.storage.from("attachments").remove([d.storage_path]);
    const { error } = await supabase.from("attachments").delete().eq("id", d.id);
    if (!error) setDocs((p) => p.filter((x) => x.id !== d.id));
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Team working for this contractor {workers.length > 0 && `(${workers.length})`}
        </h3>
        <button onClick={() => setAdding((v) => !v)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-accent">
          {adding ? "Cancel" : "Add installer"}
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Record each installer the contractor brings on site, with their photo ID and White Card.
      </p>
      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{err}</div>}

      {adding && (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-[#f6f5f2] p-3 sm:grid-cols-4">
          <input className={inputCls} placeholder="Full name" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} />
          <input className={inputCls} placeholder="Mobile" value={nw.phone} onChange={(e) => setNw({ ...nw, phone: e.target.value })} />
          <input className={inputCls} placeholder="White Card number" value={nw.whitecard_number} onChange={(e) => setNw({ ...nw, whitecard_number: e.target.value })} />
          <button onClick={addWorker} disabled={!nw.name.trim()} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            Add
          </button>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {!loading && workers.length === 0 && <p className="text-sm text-[var(--muted)]">No installers recorded for this contractor yet.</p>}
        {workers.map((w) => {
          const wd = docs.filter((d) => d.worker_id === w.id);
          const missing = CATS.filter((c) => !wd.some((d) => d.category === c));
          return (
            <div key={w.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2f0ec] text-xs font-semibold text-[var(--muted)]">{initials(w.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {w.phone || "No mobile"} · White Card {w.whitecard_number || "no. not recorded"}
                  </div>
                </div>
                {missing.length > 0 ? (
                  <span className="rounded-full bg-[#fff4d6] px-2 py-0.5 text-xs text-[#7a5a0f]">Missing: {missing.join(", ")}</span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Docs complete</span>
                )}
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={w.active} onChange={(e) => patch(w, { active: e.target.checked })} /> Active
                </label>
                <button onClick={() => removeWorker(w)} className="text-xs text-[var(--muted)] underline">
                  Remove
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CATS.map((cat) => {
                  const list = wd.filter((d) => d.category === cat);
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{cat}</span>
                        <input
                          ref={(el) => {
                            inputs.current[w.id + cat] = el;
                          }}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) upload(w, cat, f);
                            e.target.value = "";
                          }}
                        />
                        <button
                          onClick={() => inputs.current[w.id + cat]?.click()}
                          disabled={busy === w.id + cat}
                          className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:border-accent disabled:opacity-60"
                        >
                          {busy === w.id + cat ? "Uploading…" : "Upload"}
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {list.length === 0 && <span className="text-xs text-[var(--muted)]">None yet.</span>}
                        {list.map((d) => (
                          <div key={d.id} className="group relative">
                            <button
                              onClick={() => urls[d.id] && window.open(urls[d.id], "_blank")}
                              title={d.file_name || ""}
                              className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[#f2f0ec] text-xs text-[var(--muted)] hover:border-accent"
                            >
                              {isImage(d.file_name) && urls[d.id] ? <img src={urls[d.id]} alt={cat} className="h-full w-full object-cover" /> : "PDF"}
                            </button>
                            <button
                              onClick={() => removeDoc(d)}
                              title="Remove"
                              className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white group-hover:flex"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
