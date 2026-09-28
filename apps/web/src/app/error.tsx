"use client";
// Catches anything a screen throws, so a bad render shows a way back instead of a blank page.
import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, Empty, btnClass } from "@/components/ui";

export default function ScreenError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="grid min-h-[70vh] place-items-center p-4">
      <div className="grid justify-items-center gap-4">
        <Empty icon={TriangleAlert} title="This screen hit a problem">
          Anything already saved is kept — deliveries recorded offline stay on this phone and sync as usual. Try again, or start over from the sign-in screen.
        </Empty>
        <div className="flex flex-wrap justify-center gap-2">
          <Button icon={RotateCcw} onClick={() => retry()}>
            Try again
          </Button>
          <Link href="/" className={btnClass("secondary")}>
            Back to start
          </Link>
        </div>
        {error.digest && <p className="text-xs text-muted">Reference {error.digest}</p>}
      </div>
    </main>
  );
}
