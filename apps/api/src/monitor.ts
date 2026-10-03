// The live watch: every half minute, raise dwell alerts and late notices (packages/core/src/ops.ts
// `monitor`). Runs as the system, writes only when there is something to say, and is audited like any change.
import { monitor } from "@waypoint/core/ops";
import type { Service } from "./service.ts";

/** One pass. Exported for tests, which pass their own clock. */
export async function watchOnce(svc: Service, now = Date.now()) {
  // Dry run on a copy first, so a quiet minute writes nothing (no audit noise).
  const probe = monitor(structuredClone(svc.ops), now);
  if (!probe.dwell.length && !probe.late.length) return probe;
  return svc.change<ReturnType<typeof monitor>>(
    (r) => ({
      actor: "System", role: "system", action: "ops.monitor", entity: "plan",
      summary: [r.dwell.length && `${r.dwell.length} dwell alert${r.dwell.length > 1 ? "s" : ""}`, r.late.length && `${r.late.length} late notice${r.late.length > 1 ? "s" : ""} to stores`].filter(Boolean).join(", ") || "Live watch",
      detail: r,
    }),
    (d) => monitor(d, now),
  );
}

export function startWatch(svc: Service, everyMs = 30_000) {
  const timer = setInterval(() => {
    watchOnce(svc).catch((e) => console.error("Live watch failed:", e));
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
