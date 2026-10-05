"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Finger/mouse signature box. Calls onSave with a PNG data URL when the
 * person taps "Use signature", or null when they clear an existing one.
 */
export default function SignaturePad({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(!value);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#201f1c";
    setHasInk(false);
  }, [editing]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  if (!editing && value) {
    return (
      <div className="flex flex-wrap items-end gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Inspector signature" className="h-24 w-full max-w-sm rounded-lg border border-[var(--border)] bg-white object-contain" />
        <button
          type="button"
          onClick={() => {
            onSave(null);
            setEditing(true);
          }}
          className="text-sm text-[var(--muted)] hover:underline"
        >
          Clear and re-sign
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="h-32 w-full max-w-sm touch-none rounded-lg border border-dashed border-[#b9b5ac] bg-white"
        aria-label="Sign here"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasInk}
          onClick={() => {
            const url = canvasRef.current?.toDataURL("image/png");
            if (url) {
              onSave(url);
              setEditing(false);
            }
          }}
          className="rounded-lg bg-[#201f1c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Use signature
        </button>
        <button type="button" onClick={clearCanvas} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">
          Clear
        </button>
      </div>
    </div>
  );
}
