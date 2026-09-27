// Holds the live operational state and serialises every change:
//   queue → copy state → run the rule → persist the diff + audit row in one transaction → publish.
// If the rule refuses (OpError) or the transaction fails, nothing is saved and the state is unchanged.
import { EventEmitter } from "node:events";
import type { Db as OpsDb } from "@waypoint/core/contract";
import type { Db, Tx } from "./db/client.ts";
import * as t from "./db/schema.ts";
import { loadOps, persist } from "./store.ts";
import { refreshReference } from "./reference.ts";

export interface AuditEntry {
  userId?: string;
  actor: string;
  role: string;
  action: string;
  entity?: string;
  entityId?: string;
  summary: string;
  detail?: unknown;
}

/** "ops" = operational state changed, "reference" = master data changed (clients re-hydrate). */
export type ChangeKind = "ops" | "reference";

export class Service {
  private state!: OpsDb;
  private queue: Promise<unknown> = Promise.resolve();
  readonly events = new EventEmitter();

  constructor(readonly db: Db) {
    this.events.setMaxListeners(0);
  }

  async start() {
    await refreshReference(this.db);
    this.state = await loadOps(this.db as unknown as Tx);
  }

  /** The current operational state (read-only by convention: never mutate it). */
  get ops(): OpsDb {
    return this.state;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Applies an operational change.
   * `before` runs inside the transaction ahead of the diff (e.g. inserting a master row the change needs);
   * `after` runs after it (e.g. enriching the driver-event log).
   */
  change<T>(
    audit: (result: T) => AuditEntry,
    rule: (next: OpsDb) => T,
    hooks: { before?: (tx: Tx) => Promise<void>; after?: (tx: Tx, result: T) => Promise<void>; reference?: boolean } = {},
  ): Promise<T> {
    return this.serial(async () => {
      const next = structuredClone(this.state);
      const result = rule(next);
      await this.db.transaction(async (tx) => {
        await hooks.before?.(tx);
        const rows = await persist(tx, this.state, next);
        await hooks.after?.(tx, result);
        const a = audit(result);
        await tx.insert(t.auditLog).values({ ...a, userId: a.userId ?? null, entity: a.entity ?? null, entityId: a.entityId ?? null, detail: { ...(a.detail as object | undefined), rows } });
      });
      this.state = next;
      if (hooks.reference) await refreshReference(this.db);
      this.publish(hooks.reference ? "reference" : "ops");
      return result;
    });
  }

  /** A master-data change that doesn't touch operational state: write, audit, re-hydrate, publish. */
  master<T>(audit: (result: T) => AuditEntry, write: (tx: Tx) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      const result = await this.db.transaction(async (tx) => {
        const r = await write(tx);
        const a = audit(r);
        await tx.insert(t.auditLog).values({ ...a, userId: a.userId ?? null, entity: a.entity ?? null, entityId: a.entityId ?? null, detail: (a.detail ?? null) as object | null });
        return r;
      });
      await refreshReference(this.db);
      // Vehicle status lives on the vehicles table; re-read the state so the two never disagree.
      this.state = await loadOps(this.db as unknown as Tx);
      this.publish("reference");
      return result;
    });
  }

  /** Rebuilds operational state from scratch (admin "reset demo day"). */
  replaceAll(audit: AuditEntry, reset: (tx: Tx) => Promise<void>) {
    return this.serial(async () => {
      await this.db.transaction(async (tx) => {
        await reset(tx);
        await tx.insert(t.auditLog).values({ ...audit, userId: audit.userId ?? null, detail: (audit.detail ?? null) as object | null });
      });
      this.state = await loadOps(this.db as unknown as Tx);
      await refreshReference(this.db);
      this.publish("reference");
    });
  }

  publish(kind: ChangeKind) {
    this.events.emit("change", kind);
  }
}
