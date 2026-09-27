import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { env } from "../env.ts";
import * as schema from "./schema.ts";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface Database {
  db: Db;
  kind: "pglite" | "postgres";
  close(): Promise<void>;
}

/**
 * Opens the database and brings its schema up to date.
 * Embedded Postgres (PGlite) when DATABASE_URL is unset, a Postgres server otherwise: same SQL, same migrations.
 */
export async function openDatabase(opts: { url?: string; dir?: string } = {}): Promise<Database> {
  const url = opts.url ?? env.databaseUrl;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzlePg({ client: pool, schema, casing: "snake_case" });
    await migratePg(db, { migrationsFolder: env.migrationsDir });
    return { db: db as unknown as Db, kind: "postgres", close: () => pool.end() };
  }
  const dir = opts.dir ?? env.pgliteDir;
  if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true });
  const client = await PGlite.create(dir);
  const db = drizzlePglite({ client, schema, casing: "snake_case" });
  await migratePglite(db, { migrationsFolder: env.migrationsDir });
  return { db: db as unknown as Db, kind: "pglite", close: () => client.close() };
}
