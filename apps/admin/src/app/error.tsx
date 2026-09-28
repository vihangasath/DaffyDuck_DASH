"use client";
// Catches anything a screen throws, so a bad render shows a way back instead of a blank page.
import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, Empty, buttonClass } from "@/components/cabinet";

export default function ScreenError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="grid min-h-[70vh] place-items-center p-4">
      <div className="grid justify-items-center gap-4">
        <Empty icon={TriangleAlert} title="This drawer wouldn’t open">
          Nothing on file was changed. Try again, or go back to the front desk.
        </Empty>
        <div className="flex flex-wrap justify-center gap-2">
          <Button icon={RotateCcw} onClick={() => retry()}>
            Try again
          </Button>
          <Link href="/" className={buttonClass("secondary")}>
            Back to front desk
          </Link>
        </div>
        {error.digest && <p className="font-type text-xs text-muted">Reference {error.digest}</p>}
      </div>
    </main>
  );
}
