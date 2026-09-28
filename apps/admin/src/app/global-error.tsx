"use client";
// Last line of defence: replaces the root layout when it fails, so it brings its own document and styles.
import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="grid min-h-full place-items-center bg-canvas p-4 font-sans text-ink">
        <title>Something went wrong · Waypoint People</title>
        <main className="grid max-w-sm justify-items-center gap-3 text-center">
          <p className="text-lg font-bold">Waypoint People couldn’t load</p>
          <p className="text-sm text-ink-2">Nothing on file was changed. Try again, or reload the page.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => retry()} className="h-10 rounded-[3px] bg-cabinet px-4 text-sm font-semibold text-on-cabinet">
              Try again
            </button>
            <button onClick={() => window.location.reload()} className="flex h-10 items-center rounded-[3px] border border-line-strong bg-surface px-4 text-sm font-semibold">
              Reload
            </button>
          </div>
          {error.digest && <p className="font-type text-xs text-muted">Reference {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
