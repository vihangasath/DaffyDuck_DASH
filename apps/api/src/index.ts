import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { boot } from "./boot.ts";
import { env } from "./env.ts";
import { refreshPredictions } from "./models.ts";
import { startWatch } from "./monitor.ts";

const { database, svc, seeded } = await boot();
const app = createApp(svc);
// Dwell alerts and late notices need no user action, so the API watches the live runs itself.
const stopWatch = startWatch(svc);
// Datathon predictions, when a model service is configured (MODEL_URL); baselines until it answers.
if (env.modelUrl) {
  console.log(`Model service: ${env.modelUrl}`);
  void refreshPredictions(svc);
}
const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  const where = database.kind === "pglite" ? `embedded Postgres at ${env.pgliteDir}` : "Postgres server";
  console.log(`Waypoint API on http://localhost:${info.port} · ${where}${seeded ? " · seeded with demo data" : ""}`);
});

const stop = async () => {
  stopWatch();
  server.close();
  await database.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
