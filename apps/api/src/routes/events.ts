// Server-Sent Events: every open app hears "ops" (operational state changed) or "reference"
// (master data changed) and refetches.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAuth, type Env } from "../http.ts";
import type { ChangeKind } from "../service.ts";

export const eventRoutes = new Hono<Env>().get("/", requireAuth(), (c) => {
  const res = streamSSE(c, async (stream) => {
    const svc = c.var.svc;
    const queue: ChangeKind[] = [];
    let wake: (() => void) | null = null;
    const on = (kind: ChangeKind) => {
      queue.push(kind);
      wake?.();
    };
    svc.events.on("change", on);
    stream.onAbort(() => {
      svc.events.off("change", on);
      wake?.();
    });
    await stream.writeSSE({ event: "hello", data: "ready" });
    while (!stream.aborted) {
      if (!queue.length) {
        // Heartbeat every 25 s keeps proxies from closing an idle stream.
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, 25_000);
        });
        wake = null;
      }
      if (stream.aborted) break;
      const kinds = new Set(queue.splice(0));
      if (!kinds.size) await stream.writeSSE({ event: "ping", data: "" });
      for (const k of kinds) await stream.writeSSE({ event: "change", data: k });
    }
  });
  // no-transform stops proxies (including the Next.js rewrite proxy) from gzipping, and so buffering, the stream.
  res.headers.set("Cache-Control", "no-cache, no-transform");
  res.headers.set("X-Accel-Buffering", "no");
  return res;
});
