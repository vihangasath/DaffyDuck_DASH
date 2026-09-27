import { count } from "drizzle-orm";
import { openDatabase } from "./db/client.ts";
import * as t from "./db/schema.ts";
import { seedDatabase } from "./db/seed.ts";
import { ensureStaff } from "./db/staff-seed.ts";
import { Service } from "./service.ts";

/** Opens (and if needed creates and seeds) the database, then loads the live state. */
export async function boot(opts: { url?: string; dir?: string } = {}) {
  const database = await openDatabase(opts);
  const [{ n }] = await database.db.select({ n: count() }).from(t.depots);
  const seeded = Number(n) === 0;
  if (seeded) await seedDatabase(database.db);
  else await database.db.transaction((tx) => ensureStaff(tx));
  const svc = new Service(database.db);
  await svc.start();
  return { database, svc, seeded };
}
