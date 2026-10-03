// Photos: dock shortfalls (loader), proof of delivery (driver) and receipt problems (store).
//   PUT /api/photos/:id?kind=&orderId=   raw image body; the id is made on the phone, so retries are idempotent
//   GET /api/photos/:id                  the image, for anyone whose snapshot lists it
// The bytes live in the photos table; operational state keeps the metadata so screens can list them.
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PhotoMeta } from "@waypoint/core/contract";
import { ops, visibleTo } from "@waypoint/core/ops";
import * as t from "../db/schema.ts";
import { actorOf } from "../auth.ts";
import { requireAuth, type Env } from "../http.ts";

/** Phones shrink photos before upload (~200 KB); this only stops abuse. */
const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const Id = z.string().regex(/^[A-Za-z0-9-]{8,80}$/);
const Query = z.object({ kind: z.enum(["shortfall", "pod", "receipt"]), orderId: z.string().min(1).max(80) });

export const photoRoutes = new Hono<Env>()
  .use(requireAuth("dispatcher", "loader", "driver", "store"))
  .put("/:id", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    const q = Query.safeParse(c.req.query());
    if (!id.success || !q.success) return c.json({ error: "Photo id, kind and order are required." }, 400);
    const svc = c.var.svc;
    const existing = svc.ops.photos[id.data];
    if (existing) return c.json(existing);
    const type = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TYPES.has(type)) return c.json({ error: "Send a JPEG, PNG or WebP photo." }, 415);
    const data = new Uint8Array(await c.req.arrayBuffer());
    if (!data.length) return c.json({ error: "The photo is empty." }, 400);
    if (data.length > MAX_BYTES) return c.json({ error: "That photo is too large." }, 413);
    const user = c.var.auth.user;
    const actor = actorOf(user);
    const meta = await svc.change<PhotoMeta>(
      (m) => ({ userId: user.userId, actor: user.name, role: user.role, action: "photos.upload", entity: "photo", entityId: m.id, summary: `Uploaded a ${q.data.kind === "pod" ? "delivery" : q.data.kind} photo for ${m.orderId} (${Math.round(m.bytes / 1024)} KB)` }),
      (d) => ops.addPhoto(d, actor, { id: id.data, kind: q.data.kind, orderId: q.data.orderId, contentType: type, bytes: data.length }),
      {
        // Rule first (it authorises), then the bytes, inside the same transaction as the metadata.
        after: async (tx, m) => {
          await tx.insert(t.photos).values({ id: m.id, kind: m.kind, orderId: m.orderId, vehicleId: m.vehicleId ?? null, contentType: m.contentType, bytes: m.bytes, data, by: m.by, userId: user.userId, at: m.at }).onConflictDoNothing();
        },
      },
    );
    return c.json(meta);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const svc = c.var.svc;
    if (!visibleTo(svc.ops, actorOf(c.var.auth.user)).photos[id]) return c.json({ error: "Photo not found." }, 404);
    const [row] = await svc.db.select({ data: t.photos.data, contentType: t.photos.contentType }).from(t.photos).where(eq(t.photos.id, id));
    if (!row) return c.json({ error: "Photo not found." }, 404);
    return c.body(Buffer.from(row.data), 200, { "content-type": row.contentType, "cache-control": "private, max-age=86400, immutable" });
  });
