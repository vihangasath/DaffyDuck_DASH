"use client";
// Taking photos before a record is sent (loader flag, driver POD, store receipt): each is shrunk on the
// phone, previewed, removable, and kept in memory until the screen sends it.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Plus, X } from "lucide-react";
import { cx } from "@/components/ui";
import { shrinkPhoto } from "@/lib/photos";

interface PhotoDraft {
  url: string;
  blob: Blob;
}

/** Photos taken on this screen; their preview URLs are released when the screen closes. */
export function usePhotoDrafts() {
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [shrinking, setShrinking] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const all = urls.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const add = useCallback(async (file: Blob) => {
    setShrinking(true);
    const blob = await shrinkPhoto(file);
    setShrinking(false);
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    setPhotos((xs) => [...xs, { url, blob }]);
  }, []);
  const remove = useCallback((url: string) => setPhotos((xs) => xs.filter((x) => x.url !== url)), []);
  return { photos, shrinking, add, remove };
}

const SIZE = { sm: "h-16 w-20 rounded-lg", md: "h-20 w-24 rounded-xl" };

/** Thumbnails of the photos taken so far, plus a camera tile to take another. */
export function PhotoPicker({
  drafts,
  inputLabel,
  alt,
  max = Infinity,
  size = "md",
  moreLabel = "Add photo",
}: {
  drafts: ReturnType<typeof usePhotoDrafts>;
  /** Accessible name of the camera input. */
  inputLabel: string;
  /** Alt text of the thumbnails; the number is added ("Delivery photo 1"). */
  alt: string;
  max?: number;
  size?: keyof typeof SIZE;
  /** Tile label once there is at least one photo. */
  moreLabel?: string;
}) {
  const { photos, shrinking, add, remove } = drafts;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <span key={p.url} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={`${alt} ${i + 1}`} className={cx(SIZE[size], "object-cover ring-1 ring-line")} />
          <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(p.url)} className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-ink text-surface shadow-card">
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {photos.length < max && (
        <label className={cx(SIZE[size], "flex cursor-pointer flex-col items-center justify-center gap-0.5 border-2 border-dashed border-line-strong text-primary transition-colors hover:border-primary hover:bg-primary-soft")}>
          {shrinking ? <Loader2 className="size-5 animate-spin" /> : photos.length ? <Plus className="size-5" /> : <Camera className="size-5" />}
          <span className={cx("font-semibold", size === "sm" ? "text-[10px]" : "text-xs")}>{photos.length ? moreLabel : "Add photo"}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label={inputLabel}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void add(f);
            }}
          />
        </label>
      )}
    </div>
  );
}
