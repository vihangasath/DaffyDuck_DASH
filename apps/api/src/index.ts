import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { boot } from "./boot.ts";
import { env } from "./env.ts";

const { database, svc, seeded } = await boot();
const app = createApp(svc);
const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  const where = database.kind === "pglite" ? `embedded Postgres at ${env.pgliteDir}` : "Postgres server";
  console.log(`Waypoint API on http://localhost:${info.port} · ${where}${seeded ? " · seeded with demo data" : ""}`);
});

const stop = async () => {
  server.close();
  await database.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
