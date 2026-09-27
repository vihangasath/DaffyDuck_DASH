import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { LoginResult } from "@waypoint/core/contract";
import * as t from "../db/schema.ts";
import {
  clearFailures, createSession, hashPassword, noteFailure, passwordProblem, revokeSession, sessionUserOf, tooManyAttempts, verifyPassword,
} from "../auth.ts";
import { env } from "../env.ts";
import { body, requireAuth, type Env } from "../http.ts";

const Login = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(200), app: z.enum(["web", "admin"]) });
const ChangePassword = z.object({ current: z.string().min(1), next: z.string().min(1).max(200) });

export const authRoutes = new Hono<Env>()
  .post("/login", async (c) => {
    const { username, password, app } = await body(c, Login);
    const name = username.toLowerCase();
    if (tooManyAttempts(name)) return c.json({ error: "Too many attempts. Wait 10 minutes, or ask HR to reset your password." }, 429);
    const db = c.var.svc.db;
    const [u] = await db.select().from(t.users).where(eq(t.users.username, name));
    if (!u || !(await verifyPassword(password, u.passwordHash))) {
      noteFailure(name);
      return c.json({ error: "That username and password don’t match a Waypoint account." }, 401);
    }
    if (!u.active) return c.json({ error: "This account is disabled. Ask HR to re-enable it." }, 403);
    if (app === "web" && u.role === "admin") return c.json({ error: "HR accounts sign in to Waypoint People.", adminUrl: env.adminUrl }, 403);
    if (app === "admin" && u.role !== "admin") return c.json({ error: "Waypoint People is for the HR team. Sign in to the Waypoint operations app instead." }, 403);
    clearFailures(name);
    const token = await createSession(db, u.id, app, c.req.header("user-agent"));
    await db.insert(t.auditLog).values({ userId: u.id, actor: u.displayName, role: u.role, action: "auth.login", entity: "user", entityId: u.id, summary: `Signed in to ${app === "admin" ? "Waypoint People" : "the operations app"}` });
    return c.json({ token, user: await sessionUserOf(db, u), mustChangePassword: u.mustChangePassword } satisfies LoginResult & { mustChangePassword: boolean });
  })
  .get("/me", requireAuth(), (c) => c.json(c.var.auth.user))
  .post("/logout", requireAuth(), async (c) => {
    await revokeSession(c.var.svc.db, c.var.auth.sessionId);
    return c.json({ ok: true });
  })
  .post("/password", requireAuth(), async (c) => {
    const { current, next } = await body(c, ChangePassword);
    const db = c.var.svc.db;
    const me = c.var.auth.user;
    const [u] = await db.select().from(t.users).where(eq(t.users.id, me.userId));
    if (!(await verifyPassword(current, u.passwordHash))) return c.json({ error: "Your current password isn’t right." }, 400);
    const problem = passwordProblem(next);
    if (problem) return c.json({ error: problem }, 400);
    await db.update(t.users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date().toISOString() }).where(eq(t.users.id, me.userId));
    await db.insert(t.auditLog).values({ userId: me.userId, actor: me.name, role: me.role, action: "auth.password", entity: "user", entityId: me.userId, summary: "Changed their password" });
    return c.json({ ok: true });
  });
