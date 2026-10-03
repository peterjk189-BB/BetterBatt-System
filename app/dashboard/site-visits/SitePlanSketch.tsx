"use client";

import { useEffect, useRef, useState } from "react";

// Draw a site plan on the phone/iPad: over a photo of the house plans, over
// an existing site photo, or on a blank grid. Pen, pink marker (the "install
// up to here" line), yellow highlighter (the area to insulate) and text
// labels, matching how the paper plans were marked up.

type Pt = { x: number; y: number };
type Stroke = { kind: "stroke"; tool: Tool; points: Pt[] };
type Label = { kind: "text"; text: string; at: Pt; color: string };
type Mark = Stroke | Label;
type Tool = "pen" | "pink" | "highlight" | "text";

const TOOLS: { key: Tool; label: string; swatch: string }[] = [
  { key: "highlight", label: "Highlight", swatch: "#f7f034" },
  { key: "pink", label: "Pink line", swatch: "#ff2fa0" },
  { key: "pen", label: "Pen", swatch: "#1d1d1b" },
  { key: "text", label: "Text", swatch: "#1d1d1b" },
];

const MAX_SIDE = 1600;

export type SketchBackground = { kind: "blank" } | { kind: "blob"; blob: Blob };

export default function SitePlanSketch({
  background,
  onCancel,
  onSave,
}: {
  background: SketchBackground;
  onCancel: () => void;
  onSave: (jpeg: Blob) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<Tool>("highlight");
  const [saving, setSaving] = useState(false);
  const [pendingText, setPendingText] = useState<{ at: Pt; value: string } | null>(null);
  const drawing = useRef<Stroke | null>(null);

  // Load the background and size the canvas to it (or a 4:3 blank sheet).
  useEffect(() => {
    let url: string | null = null;
    if (background.kind === "blank") {
      bgRef.current = null;
      setSize({ w: 1600, h: 1200 });
      return;
    }
    url = URL.createObjectURL(background.blob);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      bgRef.current = img;
      setSize({ w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) });
    };
    img.src = url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [background]);

  const lineWidth = (t: Tool, w: number) => (t === "highlight" ? w * 0.03 : t === "pink" ? w * 0.008 : w * 0.004);
  const fontSize = (w: number) => Math.round(w * 0.035);

  // Redraw everything whenever marks change.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !size) return;
    const ctx = c.getContext("2d")!;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.w, size.h);
    if (bgRef.current) {
      ctx.drawImage(bgRef.current, 0, 0, size.w, size.h);
    } else {
      ctx.strokeStyle = "#dfe6ee";
      ctx.lineWidth = 1;
      const step = size.w / 32;
      for (let x = step; x < size.w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.h);
        ctx.stroke();
      }
      for (let y = step; y < size.h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size.w, y);
        ctx.stroke();
      }
    }
    for (const m of marks) {
      if (m.kind === "text") {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.font = `600 ${fontSize(size.w)}px system-ui, sans-serif`;
        ctx.lineWidth = fontSize(size.w) * 0.18;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(m.text, m.at.x, m.at.y);
        ctx.fillStyle = m.color;
        ctx.fillText(m.text, m.at.x, m.at.y);
        continue;
      }
      const sw = TOOLS.find((t) => t.key === m.tool)!.swatch;
      ctx.lineCap = m.tool === "highlight" ? "square" : "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = lineWidth(m.tool, size.w);
      ctx.strokeStyle = sw;
      // Multiply keeps the plan's linework readable underneath the highlighter.
      ctx.globalCompositeOperation = m.tool === "highlight" ? "multiply" : "source-over";
      ctx.globalAlpha = m.tool === "highlight" ? 0.75 : 1;
      ctx.beginPath();
      m.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (m.points.length === 1) ctx.lineTo(m.points[0].x + 0.1, m.points[0].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }, [marks, size]);

  function toCanvas(e: React.PointerEvent<HTMLCanvasElement>): Pt {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "text") {
      setPendingText({ at: toCanvas(e), value: "" });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const s: Stroke = { kind: "stroke", tool, points: [toCanvas(e)] };
    drawing.current = s;
    setMarks((m) => [...m, s]);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = drawing.current;
    if (!s) return;
    const p = toCanvas(e);
    const last = s.points[s.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    const next: Stroke = { ...s, points: [...s.points, p] };
    drawing.current = next;
    setMarks((m) => [...m.slice(0, -1), next]);
  }

  function up() {
    drawing.current = null;
  }

  function addText() {
    if (!pendingText || !pendingText.value.trim()) {
      setPendingText(null);
      return;
    }
    setMarks((m) => [...m, { kind: "text", text: pendingText.value.trim(), at: pendingText.at, color: "#1d1d1b" }]);
    setPendingText(null);
  }

  async function save() {
    const c = canvasRef.current;
    if (!c) return;
    setSaving(true);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.88));
    if (blob) await onSave(blob);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1d1d1b]/95" role="dialog" aria-label="Draw site plan">
      <div
        className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-white"
        style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
      >
        <span className="mr-1 font-semibold">Site plan</span>
        {TOOLS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTool(t.key)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
              tool === t.key ? "border-white bg-white text-[#1d1d1b]" : "border-white/25 text-white"
            }`}
          >
            <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: t.swatch }} />
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setMarks((m) => m.slice(0, -1))}
          disabled={marks.length === 0}
          className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-40"
        >
          Undo
        </button>
        <button
          onClick={() => setMarks([])}
          disabled={marks.length === 0}
          className="rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        {size ? (
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className="max-h-full max-w-full touch-none rounded bg-white shadow-lg"
            style={{ aspectRatio: `${size.w} / ${size.h}` }}
          />
        ) : (
          <p className="text-sm text-white/70">Loading…</p>
        )}

        {pendingText && (
          <div className="absolute inset-x-3 top-3 mx-auto flex max-w-md gap-2 rounded-xl bg-white p-3 shadow-xl">
            <input
              autoFocus
              value={pendingText.value}
              onChange={(e) => setPendingText({ ...pendingText, value: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addText()}
              placeholder="Label, e.g. 56.7 m² or Tight access"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-base"
            />
            <button onClick={addText} className="rounded-lg bg-[#1d1d1b] px-3 py-2 text-sm font-medium text-white">
              Add
            </button>
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <p className="hidden text-xs text-white/60 sm:block">
          {tool === "text" ? "Tap where the label should go." : "Draw with your finger, an Apple Pencil or the mouse."}
        </p>
        <div className="ml-auto flex gap-2">
          <button onClick={onCancel} className="rounded-lg border border-white/25 px-4 py-2.5 text-sm text-white">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !size}
            className="rounded-lg bg-[var(--brand-gold)] px-4 py-2.5 text-sm font-semibold text-[#201f1c] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save site plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
