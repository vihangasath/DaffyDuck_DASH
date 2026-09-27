"use client";
// Driver offline store (IndexedDB via Dexie).
//  - outbox:   every driver action, written here BEFORE any network call (local-first)
//  - snapshot: the last run received from the server, so the app works with no signal
import Dexie, { type Table } from "dexie";
import type { DriverEvent, StopRecord } from "@waypoint/core/contract";
import type { TripEval } from "@waypoint/core/planner/evaluate";

export interface OutboxRow {
  id: string; // client-generated; the server de-duplicates on it (idempotent retries)
  vehicleId: string;
  event: DriverEvent;
  createdAt: string;
  status: "queued" | "synced";
  syncedAt?: string;
}

export interface RunSnapshot {
  vehicleId: string;
  planVersion: number;
  savedAt: string;
  trips: TripEval[];
  stops: Record<string, StopRecord>;
  loadStatus: Record<string, string>;
  /** Quantities actually loaded at the dock, key `orderId|skuId` (lower than planned after a shortfall). */
  loaded: Record<string, number>;
}

class DriverDb extends Dexie {
  outbox!: Table<OutboxRow, string>;
  snapshot!: Table<RunSnapshot, string>;
  constructor() {
    super("waypoint-driver");
    this.version(1).stores({ outbox: "id, vehicleId, status, createdAt", snapshot: "vehicleId" });
  }
}

let _db: DriverDb | null = null;
export const driverDb = () => (_db ??= new DriverDb());

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function enqueue(event: DriverEvent) {
  await driverDb().outbox.put({ id: event.id, vehicleId: event.vehicleId, event, createdAt: new Date().toISOString(), status: "queued" });
}
