import type { DeferralCode, Depot, Order, Plan, Role, Temp, VehicleStatus } from "./domain/types";
import type { Reference } from "./reference";
import type { MoveTarget } from "./planner/allocate";
import type { Violation } from "./planner/evaluate";

/** Operational state as the API serves it. The API stores it across relational tables. */
export interface Db {
  schema: 3;
  orders: Order[];
  day: Record<Depot, { ordersClosed: boolean; closedAt?: string; closedBy?: string }>;
  plans: Record<Depot, Plan | null>;
  fleetStatus: Record<string, VehicleStatus>;
  loads: Record<string, LoadCheck>; // by trip id
  shortfalls: Shortfall[];
  stops: Record<string, StopRecord>; // by order id
  receipts: Record<string, Receipt>; // by order id
  notices: Notice[];
  exceptions: DispatchException[];
  driverSync: Record<string, { lastSyncAt: string; lastPlanVersion: number }>;
  processedEventIds: string[];
  deferralLog: DeferralLogEntry[];
}

export interface LoadLine {
  planned: number;
  loaded: number;
}
export interface LoadCheck {
  tripId: string;
  vehicleId: string;
  planVersion: number;
  /** Plan version in which this list last changed after it was first published (drives "plan changed"). */
  changedVersion?: number;
  /** key = `${orderId}|${skuId}` */
  lines: Record<string, LoadLine>;
  status: "not_started" | "loading" | "held" | "released";
  releasedAt?: string;
  releasedBy?: string;
}

export interface Shortfall {
  id: string;
  tripId: string;
  vehicleId: string;
  orderId: string;
  outletId: string;
  skuId: string;
  name: string;
  planned: number;
  loaded: number;
  kind: "missing" | "damaged" | "wrong_item";
  decision: "release" | "hold";
  photo: boolean;
  by: string;
  at: string;
  resolution?: "release" | "repick" | "tomorrow";
  resolvedBy?: string;
}

export interface PodLine {
  skuId: string;
  name: string;
  planned: number;
  delivered: number;
}
export interface StopRecord {
  orderId: string;
  vehicleId: string;
  arrivedAt?: string; // demo-clock HH:MM
  deliveredAt?: string;
  pod?: { receivedBy: string; signed: boolean; photos: number; lines: PodLine[]; note?: string };
  problem?: { reason: string; tempC?: number; note?: string };
  recordedAt: string; // release time until the first device event, then device wall-clock ISO
  syncedAt: string; // server wall-clock ISO when received
}

export interface Receipt {
  orderId: string;
  confirmedAt: string;
  by: string;
  lines: { skuId: string; name: string; driverQty: number; receivedQty: number }[];
  issues: { type: string; note?: string }[];
}

export interface Notice {
  id: string;
  outletId: string;
  orderId?: string;
  kind: "order_confirmed" | "deferral" | "shortfall" | "delivered" | "eta";
  title: string;
  body: string;
  at: string;
  acknowledged?: "ok" | "reduce" | null;
}

export interface DispatchException {
  id: string;
  depot: Depot;
  kind: "shortfall" | "failed_stop" | "receipt_issue" | "delivered_with_issue";
  severity: "danger" | "warning" | "info";
  title: string;
  body: string;
  at: string;
  ref: { orderId?: string; tripId?: string; vehicleId?: string; shortfallId?: string };
  resolved?: boolean;
}

export interface DeferralLogEntry {
  id: string;
  orderId: string;
  date: string;
  outletId: string;
  brand: string;
  temp: string;
  volumeM3: number;
  code: DeferralCode | "HISTORICAL";
  reason: string;
  decidedBy: string;
  storeNotified: boolean;
}

/** Driver-side events queued in the outbox and replayed on sync. */
export type DriverEvent =
  | { id: string; vehicleId: string; kind: "arrived"; orderId: string; at: string; recordedAt: string }
  | { id: string; vehicleId: string; kind: "delivered"; orderId: string; at: string; recordedAt: string; pod: NonNullable<StopRecord["pod"]> }
  | { id: string; vehicleId: string; kind: "problem"; orderId: string; at: string; recordedAt: string; problem: NonNullable<StopRecord["problem"]> };

export interface SyncResult {
  accepted: string[];
  duplicates: string[];
  /**
   * Events the server refused. `retry` = the refusal may clear on its own (the loader hasn't released the
   * trip yet), so the phone keeps the record queued; otherwise it is shown to the driver as "not accepted".
   */
  rejected: { id: string; reason: string; retry?: boolean }[];
  planVersion: number;
}

export interface PlaceOrderInput {
  outletId: string;
  date: string;
  temp: Temp;
  lines: { skuId: string; qty: number }[];
  by: string;
}

/**
 * The contract between the web app and the API (apps/api). HttpApi in apps/web implements it
 * against the endpoints in docs/INTEGRATION.md. The acting user always comes from the session:
 * the `by` arguments are kept for call-site compatibility and ignored by the server.
 */
export interface WaypointApi {
  snapshot(): Promise<Db>;
  placeOrder(input: PlaceOrderInput): Promise<Order>;
  closeOrdersAndPlan(depot: Depot, by: string): Promise<Plan>;
  replan(depot: Depot, by: string): Promise<Plan>;
  moveOrder(depot: Depot, orderId: string, target: MoveTarget, by: string): Promise<{ ok: boolean; violations: Violation[]; warnings: string[] }>;
  publishPlan(depot: Depot, by: string): Promise<Plan>;
  setVehicleStatus(vehicleId: string, status: VehicleStatus): Promise<void>;
  setLoadLine(tripId: string, key: string, loaded: number): Promise<void>;
  flagShortfall(input: Omit<Shortfall, "id" | "at" | "resolution" | "resolvedBy">): Promise<Shortfall>;
  releaseTrip(tripId: string, by: string): Promise<void>;
  resolveShortfall(id: string, resolution: NonNullable<Shortfall["resolution"]>, by: string): Promise<void>;
  syncDriverEvents(vehicleId: string, events: DriverEvent[]): Promise<SyncResult>;
  ackNotice(id: string, response: "ok" | "reduce"): Promise<void>;
  confirmReceipt(receipt: Omit<Receipt, "confirmedAt">): Promise<void>;
  resolveException(id: string): Promise<void>;
}

/** The signed-in user, as the API describes them. Operational screens key off role and scope. */
export interface SessionUser {
  userId: string;
  username: string;
  name: string;
  role: Role;
  depot: Depot;
  title: string;
  vehicleId?: string;
  driverId?: string;
  outletId?: string;
  /** Store managers: "outlet" = their own outlet only, "depot" = any outlet served by their depot. */
  outletScope?: "outlet" | "depot";
}

export interface LoginResult {
  token: string;
  user: SessionUser;
}

/** GET /api/ops/snapshot: operational state plus the reference data it refers to. */
export interface Snapshot {
  db: Db;
  reference: Reference;
}
