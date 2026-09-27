import { Hono } from "hono";
import { onError, type Env } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { eventRoutes } from "./routes/events.ts";
import { networkRoutes } from "./routes/network.ts";
import { opsRoutes } from "./routes/ops.ts";
import { peopleRoutes } from "./routes/people.ts";
import type { Service } from "./service.ts";

export function createApp(svc: Service) {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("svc", svc);
    await next();
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  });
  app.get("/", (c) => c.json({ ok: true, name: "Waypoint API", status: "running", health: "/api/health" }));
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", authRoutes);
  app.route("/api/ops", opsRoutes);
  app.route("/api/people", peopleRoutes);
  app.route("/api/network", networkRoutes);
  app.route("/api/events", eventRoutes);
  app.notFound((c) => c.json({ error: "Not found." }, 404));
  app.onError(onError);
  return app;
}
