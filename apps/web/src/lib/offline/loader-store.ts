"use client";
// Loader phone app offline store (IndexedDB via Dexie), the dock's counterpart of the driver outbox.
//  - ticks:    every checklist change, written here BEFORE any network call and replayed in order.
//              setLoadLine sets an absolute quantity, so a replay can never double-count.
//  - snapshot: the last dock state and master data received, so a reload with no Wi-Fi still opens.
import Dexie, { type Table } from "dexie";
import type { Db, Snapshot } from "@waypoint/core/contract";

export interface TickRow {
  id: string;
  tripId: string;
  /** `${orderId}|${skuId}` */
  key: string;
  loaded: number;
  createdAt: string;
  /** "rejected" = the server refused it for good (e.g. dispatch moved the order); kept so it is never lost silently. */
  status: "queued" | "synced" | "rejected";
  syncedAt?: string;
  rejectedReason?: string;
}

export interface DockSnapshot {
  depot: string;
  savedAt: string;
  db: Db;
  reference: Snapshot["reference"] | null;
}

class LoaderDb extends Dexie {
  ticks!: Table<TickRow, string>;
  snapshot!: Table<DockSnapshot, string>;
  constructor() {
    super("waypoint-loader");
    this.version(1).stores({ ticks: "id, tripId, status, createdAt", snapshot: "depot" });
  }
}

let _db: LoaderDb | null = null;
export const loaderDb = () => (_db ??= new LoaderDb());
