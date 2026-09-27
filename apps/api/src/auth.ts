// Passwords: scrypt with a per-user salt (node:crypto, no native add-ons).
// Sessions: an opaque random token sent as `Authorization: Bearer …`; only its SHA-256 is stored,
// so a copy of the database can't be replayed as live sessions.
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import type { SessionUser } from "@waypoint/core/contract";
import type { Actor } from "@waypoint/core/ops";
import { depotName } from "@waypoint/core/reference";
import type { Depot, Role } from "@waypoint/core/domain/types";
import type { Db } from "./db/client.ts";
import * as t from "./db/schema.ts";
import { env } from "./env.ts";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const got = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A password good enough for a staff account: 8+ characters with a letter and a digit. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Use at least one letter and one number.";
  return null;
}

type UserRow = typeof t.users.$inferSelect;

const TITLE: Record<Role, string> = { admin: "Administrator", dispatcher: "Dispatcher", loader: "Loader", driver: "Driver", store: "Store manager" };

/** Builds the session user, pulling the driver's assigned vehicle and depot from the master data. */
export async function sessionUserOf(db: Db, u: UserRow): Promise<SessionUser> {
  let depot = (u.depotId ?? "Peliyagoda") as Depot;
  let vehicleId: string | undefined;
  if (u.driverId) {
    const [d] = await db.select().from(t.drivers).where(eq(t.drivers.id, u.driverId));
    if (d) {
      depot = d.depotId as Depot;
      vehicleId = d.vehicleId ?? undefined;
    }
  }
  const place = u.role === "driver" ? (vehicleId ?? "no vehicle assigned") : u.role === "store" && u.outletId ? u.outletId : depotName(depot);
  return {
    userId: u.id,
    username: u.username,
    name: u.displayName,
    role: u.role,
    depot,
    title: `${TITLE[u.role]} · ${place}`,
    vehicleId,
    driverId: u.driverId ?? undefined,
    outletId: u.outletId ?? undefined,
    outletScope: u.role === "store" ? ((u.outletScope as "outlet" | "depot" | null) ?? "outlet") : undefined,
  };
}

export const actorOf = (s: SessionUser): Actor => ({
  userId: s.userId, name: s.name, role: s.role, depot: s.depot, vehicleId: s.vehicleId, outletId: s.outletId, outletScope: s.outletScope,
});

export async function createSession(db: Db, userId: string, app: "web" | "admin", userAgent?: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionHours * 3600_000).toISOString();
  await db.insert(t.sessions).values({ id: randomUUID(), tokenHash: sha256(token), userId, app, userAgent: userAgent?.slice(0, 200) ?? null, expiresAt });
  await db.update(t.users).set({ lastLoginAt: new Date().toISOString() }).where(eq(t.users.id, userId));
  return token;
}

export interface Authed {
  sessionId: string;
  app: string;
  user: SessionUser;
}

/** Resolves a bearer token to its user; null when missing, expired, revoked or the account is inactive. */
export async function authenticate(db: Db, token: string | undefined | null): Promise<Authed | null> {
  if (!token) return null;
  const now = new Date().toISOString();
  const [row] = await db
    .select({ s: t.sessions, u: t.users })
    .from(t.sessions)
    .innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    .where(and(eq(t.sessions.tokenHash, sha256(token)), gt(t.sessions.expiresAt, now)));
  if (!row || !row.u.active) return null;
  // Keep "last seen" useful without writing on every request.
  if (Date.now() - Date.parse(row.s.lastSeenAt.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) > 5 * 60_000) {
    await db.update(t.sessions).set({ lastSeenAt: now }).where(eq(t.sessions.id, row.s.id));
  }
  return { sessionId: row.s.id, app: row.s.app, user: await sessionUserOf(db, row.u) };
}

export async function revokeSession(db: Db, sessionId: string) {
  await db.delete(t.sessions).where(eq(t.sessions.id, sessionId));
}
export async function revokeUserSessions(db: Db, userId: string) {
  await db.delete(t.sessions).where(eq(t.sessions.userId, userId));
}

/** Slows down password guessing: 8 failures per username per 10 minutes. */
const failures = new Map<string, number[]>();
export function tooManyAttempts(username: string) {
  const recent = (failures.get(username) ?? []).filter((at) => Date.now() - at < 10 * 60_000);
  failures.set(username, recent);
  return recent.length >= 8;
}
export function noteFailure(username: string) {
  failures.set(username, [...(failures.get(username) ?? []), Date.now()]);
}
export function clearFailures(username: string) {
  failures.delete(username);
}
