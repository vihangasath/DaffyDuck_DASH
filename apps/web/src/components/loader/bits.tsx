"use client";
import Link from "next/link";
import { SyncPill } from "@/components/ui";
import { useLoader } from "./loader-context";

/** The sync pill in every loader header; tapping it opens More, where the queue and connection live. */
export function LoaderSync() {
  const d = useLoader();
  return (
    <Link href="/loader/more" aria-label="Sync status">
      <SyncPill state={!d.connected ? "off" : d.syncing || d.queued ? "sync" : "ok"} queued={d.queued} />
    </Link>
  );
}
