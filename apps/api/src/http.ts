import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Role } from "@waypoint/core/domain/types";
import { OpError } from "@waypoint/core/ops";
import { authenticate, type Authed } from "./auth.ts";
import type { Service } from "./service.ts";

export type Env = { Variables: { auth: Authed; svc: Service } };

const bearer = (c: Context) => {
  const h = c.req.header("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
};

/** Requires a signed-in user (optionally with one of `roles`) and exposes it as c.var.auth. */
export function requireAuth(...roles: Role[]): MiddlewareHandler<Env> {
  return async (c, next) => {
    // EventSource can't send headers, so the event stream also accepts ?token=.
    const token = bearer(c) ?? (c.req.path.endsWith("/events") ? c.req.query("token") : null);
    const auth = await authenticate(c.var.svc.db, token);
    if (!auth) return c.json({ error: "Your session has ended. Please sign in again." }, 401);
    if (roles.length && !roles.includes(auth.user.role)) return c.json({ error: "Your account can’t do that." }, 403);
    c.set("auth", auth);
    await next();
  };
}

/** Parses a JSON body against a schema; a mismatch becomes a 400 with the first problem in plain words. */
export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "The request body must be JSON." });
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HTTPException(400, { message: `${i.path.join(".") || "Request"}: ${i.message}` });
  }
  return r.data;
}

export function onError(err: Error, c: Context) {
  if (err instanceof OpError) return c.json({ error: err.message }, err.status as 400);
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  // Unique-key clashes surface as friendly 409s (e.g. a username that already exists).
  const pg = err as { code?: string; cause?: { code?: string; detail?: string } };
  const code = pg.code ?? pg.cause?.code;
  if (code === "23505") return c.json({ error: "That already exists. Choose a different id or username." }, 409);
  if (code === "23503") return c.json({ error: "That record is still used elsewhere, so it can’t be changed this way." }, 409);
  console.error(err);
  return c.json({ error: "Something went wrong on the server. Please try again." }, 500);
}
