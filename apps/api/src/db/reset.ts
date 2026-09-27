// `npm run db:reset`: deletes the embedded database folder so the next start re-creates and re-seeds it.
import { rmSync } from "node:fs";
import { env } from "../env.ts";

if (env.databaseUrl) {
  console.error("DATABASE_URL points at a Postgres server; reset it with your own tooling (or use the admin console's reset).");
  process.exit(1);
}
rmSync(env.pgliteDir, { recursive: true, force: true });
console.log(`Removed ${env.pgliteDir}. The API re-seeds it on its next start.`);
