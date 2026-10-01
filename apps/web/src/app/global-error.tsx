"use client";
// Last line of defence: replaces the root layout when it fails, so it brings its own document and styles.
import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="grid min-h-full place-items-center bg-canvas p-4 font-sans text-ink">
        <title>Something went wrong · DASH</title>
        <main className="grid max-w-sm justify-items-center gap-3 text-center">
          <p className="text-lg font-bold tracking-tight">DASH couldn’t load</p>
          <p className="text-sm leading-relaxed text-ink-2">Anything already saved is kept. Try again, or reload the app.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => retry()} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary">
              Try again
            </button>
            <button onClick={() => window.location.reload()} className="rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm font-semibold">
              Reload
            </button>
          </div>
          {error.digest && <p className="text-xs text-muted">Reference {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
