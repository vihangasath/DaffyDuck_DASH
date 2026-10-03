"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, ChevronRight, ImageOff, Loader2, Smartphone, X } from "lucide-react";
import { cx } from "@/components/ui";
import { photoUrl } from "@/lib/photos";
import { fmtClock } from "@waypoint/core/domain/time";

interface PhotoRef {
  id: string;
  /** False while the photo is still on the phone that took it. */
  uploaded: boolean;
  /** Shown under the photo in the viewer ("Driver · 06:12"). */
  caption?: string;
}

function usePhoto(p: PhotoRef) {
  const [state, set] = useState<{ id: string; url?: string; failed?: boolean }>({ id: p.id });
  useEffect(() => {
    if (!p.uploaded) return;
    let live = true;
    photoUrl(p.id).then(
      (url) => live && set({ id: p.id, url }),
      () => live && set({ id: p.id, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [p.id, p.uploaded]);
  return state.id === p.id ? state : { id: p.id };
}

function Thumb({ p, size, onOpen }: { p: PhotoRef; size: "sm" | "md"; onOpen: () => void }) {
  const s = usePhoto(p);
  const box = size === "sm" ? "h-12 w-16" : "h-20 w-28";
  if (!p.uploaded)
    return (
      <span title="Still on the phone; it uploads when the phone has signal" className={cx(box, "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-line-strong bg-canvas text-[10px] font-semibold text-muted")}>
        <Smartphone className="size-4" /> On phone
      </span>
    );
  return (
    <button type="button" onClick={onOpen} aria-label={`Open photo${p.caption ? `: ${p.caption}` : ""}`} className={cx(box, "group relative shrink-0 overflow-hidden rounded-lg bg-subtle ring-1 ring-line transition-shadow hover:ring-2 hover:ring-primary")}>
      {s.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.url} alt="" className="size-full object-cover" />
      ) : s.failed ? (
        <ImageOff className="m-auto size-4 text-muted" />
      ) : (
        <Loader2 className="m-auto size-4 animate-spin text-muted" />
      )}
    </button>
  );
}

/** A row of photo thumbnails; each opens the full-size viewer. */
export function PhotoStrip({ photos, size = "sm", className }: { photos: PhotoRef[]; size?: "sm" | "md"; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className={cx("flex flex-wrap gap-1.5", className)}>
        {photos.map((p, i) => (
          <Thumb key={p.id} p={p} size={size} onOpen={() => setOpen(i)} />
        ))}
      </div>
      {open != null && <Viewer photos={photos} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** "📷 3 photos" as a link-style button that opens the viewer. */
export function PhotoLink({ photos, className }: { photos: PhotoRef[]; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!photos.length) return null;
  const waiting = photos.filter((p) => !p.uploaded).length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline", className)}>
        <Camera className="size-3.5" /> {photos.length} photo{photos.length > 1 ? "s" : ""}
        {waiting > 0 && <span className="font-medium text-muted">({waiting} on phone)</span>}
      </button>
      {open && <Viewer photos={photos} start={0} onClose={() => setOpen(false)} />}
    </>
  );
}

function Viewer({ photos, start, onClose }: { photos: PhotoRef[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const p = photos[i];
  const s = usePhoto(p);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(photos.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [photos.length, onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex-1 text-sm font-semibold">
          {p.caption ?? "Photo"} <span className="font-normal text-white/60">· {i + 1} of {photos.length}</span>
        </span>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-white/10"><X className="size-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
        {!p.uploaded ? (
          <p className="flex items-center gap-2 text-white/70"><Smartphone className="size-5" /> Still on the phone; it uploads when the phone has signal.</p>
        ) : s.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.url} alt={p.caption ?? "Photo"} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : s.failed ? (
          <p className="flex items-center gap-2 text-white/70"><ImageOff className="size-5" /> This photo couldn’t be loaded.</p>
        ) : (
          <Loader2 className="size-6 animate-spin text-white/70" />
        )}
        {i > 0 && (
          <button onClick={() => setI(i - 1)} aria-label="Previous photo" className="absolute left-3 rounded-full bg-white/10 p-2.5 hover:bg-white/20"><ChevronLeft className="size-6" /></button>
        )}
        {i < photos.length - 1 && (
          <button onClick={() => setI(i + 1)} aria-label="Next photo" className="absolute right-3 rounded-full bg-white/10 p-2.5 hover:bg-white/20"><ChevronRight className="size-6" /></button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Photo references for one record, from the ids it lists and the photos the server already has. */
export const photoRefs = (ids: string[] | undefined, have: Record<string, { by: string; at: string }>, who: string): PhotoRef[] =>
  (ids ?? []).map((id) => {
    const m = have[id];
    return { id, uploaded: !!m, caption: m ? `${who} · ${m.by} · ${fmtClock(m.at)}` : who };
  });
