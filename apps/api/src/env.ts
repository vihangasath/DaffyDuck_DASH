import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const env = {
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  /** A real Postgres server (Docker, production). When unset, an embedded Postgres (PGlite) is used. */
  databaseUrl: process.env.DATABASE_URL || undefined,
  /** Where embedded Postgres keeps its files. `memory://` keeps nothing (tests). */
  pgliteDir: process.env.PGLITE_DIR ?? join(repoRoot, ".data", "pglite"),
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  /** Waypoint People (the HR panel): shown to HR accounts that try to sign in to the operations app. */
  adminUrl: process.env.ADMIN_URL ?? "http://localhost:3001",
  migrationsDir: join(repoRoot, "apps/api/drizzle"),
  /** The Datathon model service (apps/models). When unset or unreachable, the app uses its baselines. */
  modelUrl: process.env.MODEL_URL?.replace(/\/+$/, "") || undefined,
  modelTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS ?? 5000),
};
