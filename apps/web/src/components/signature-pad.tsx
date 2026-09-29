"use client";
import { useEffect, useRef, useState } from "react";

/** Minimal finger signature pad (pointer events). Reports whether anything was drawn. */
export function SignaturePad({ onChange }: { onChange: (signed: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  const getStroke = () => {
    if (!ref.current) return "#0f1b2a";
    return getComputedStyle(ref.current).getPropertyValue("--color-ink").trim() || "#0f1b2a";
  };

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = getStroke();
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div className="grid gap-1">
      <canvas
        ref={ref}
        aria-label="Signature area — sign with your finger"
        className="h-28 w-full touch-none rounded-[10px] border border-line-strong bg-canvas"
        onPointerDown={(e) => {
          drawing.current = true;
          const ctx = ref.current!.getContext("2d")!;
          ctx.strokeStyle = getStroke();
          ctx.beginPath();
          ctx.moveTo(...pos(e));
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          ctx.lineTo(...pos(e));
          ctx.stroke();
          if (!signed) {
            setSigned(true);
            onChange(true);
          }
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <div className="flex justify-between text-xs text-muted">
        <span>{signed ? "Signed" : "Receiver signs here"}</span>
        <button
          type="button"
          className="font-semibold text-primary"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setSigned(false);
            onChange(false);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
