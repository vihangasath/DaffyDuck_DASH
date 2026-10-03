"use client";
// Driver offline store (IndexedDB via Dexie).
//  - outbox:   every driver action, written here BEFORE any network call (local-first)
//  - snapshot: the last run received from the server, so the app works with no signal
//  - photos:   proof-of-delivery photos, kept here until they upload (the POD only carries their ids)
//  - netlog:   each time the app lost or regained the server, uploaded with the next sync
import Dexie, { type Table } from "dexie";
import type { DriverEvent, StopRecord } from "@waypoint/core/contract";
import type { TripEval } from "@waypoint/core/planner/evaluate";

export interface OutboxRow {
  id: string; // client-generated; the server de-duplicates on it (idempotent retries)
  vehicleId: string;
  event: DriverEvent;
  createdAt: string;
  /** "rejected" = the server refused it for good (e.g. the stop was already recorded); kept so it is never lost silently. */
  status: "queued" | "synced" | "rejected";
  syncedAt?: string;
  rejectedReason?: string;
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

export interface PhotoRow {
  id: string; // client-generated; the upload is idempotent on it
  vehicleId: string;
  orderId: string;
  blob: Blob;
  createdAt: string;
  status: "queued" | "uploaded" | "rejected";
  uploadedAt?: string;
  rejectedReason?: string;
}

export interface NetRow {
  id: string;
  vehicleId: string;
  state: "offline" | "online";
  at: string;
  /** 1 once the server has it. */
  sent: 0 | 1;
}

class DriverDb extends Dexie {
  outbox!: Table<OutboxRow, string>;
  snapshot!: Table<RunSnapshot, string>;
  photos!: Table<PhotoRow, string>;
  netlog!: Table<NetRow, string>;
  constructor() {
    super("waypoint-driver");
    this.version(1).stores({ outbox: "id, vehicleId, status, createdAt", snapshot: "vehicleId" });
    this.version(2).stores({ photos: "id, vehicleId, orderId, status", netlog: "id, vehicleId, sent, at" });
  }
}

let _db: DriverDb | null = null;
export const driverDb = () => (_db ??= new DriverDb());

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function enqueue(event: DriverEvent) {
  await driverDb().outbox.put({ id: event.id, vehicleId: event.vehicleId, event, createdAt: new Date().toISOString(), status: "queued" });
}
