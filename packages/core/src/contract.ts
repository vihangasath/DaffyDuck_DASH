import type { DeferralCode, Depot, Order, Plan, Role, Temp, VehicleStatus } from "./domain/types";
import type { Reference } from "./reference";
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
  driverSync: Record<string, DriverSyncState>;
  processedEventIds: string[];
  deferralLog: DeferralLogEntry[];
  /** Photo metadata by id; the image bytes stay in the database and are served by GET /api/photos/:id. */
  photos: Record<string, PhotoMeta>;
  /** Each time a driver phone went offline or came back, newest first (uploaded on the next sync). */
  connectivity: ConnectivityEvent[];
}

/** A phone location fix (browser geolocation: GPS, Wi-Fi or cell, whatever the phone provides). */
export interface Position {
  lat: number;
  lng: number;
  /** Radius of uncertainty in metres, as the phone reports it. */
  accuracyM: number;
  /** Device time of the fix (ISO). */
  at: string;
}

/** What the phone says it holds, checked against the database on every sync. */
export interface SyncCheck {
  at: string;
  /** Records the phone believes reached the server. */
  phoneSynced: number;
  /** Records still waiting on the phone after this sync. */
  phoneQueued: number;
  /** Photos still waiting on the phone to upload. */
  photosQueued?: number;
  phoneRejected: number;
  oldestQueuedAt?: string;
  /** Records the phone marks as synced that the database doesn't have (the phone re-sends them). */
  missing: string[];
}

export interface DriverSyncState {
  lastSyncAt: string;
  lastPlanVersion: number;
  position?: Position;
  /** Recent positions, oldest first (a short trail for the dispatcher's map). */
  trail?: Position[];
  check?: SyncCheck;
}

export interface ConnectivityEvent {
  id: string;
  vehicleId: string;
  state: "offline" | "online";
  /** Device time of the change. */
  at: string;
  receivedAt: string;
}

export type PhotoKind = "shortfall" | "pod" | "receipt";
export interface PhotoMeta {
  id: string;
  kind: PhotoKind;
  orderId: string;
  vehicleId?: string;
  contentType: string;
  bytes: number;
  by: string;
  at: string;
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
  /** Photos uploaded with the flag (PhotoMeta ids). */
  photoIds?: string[];
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
export interface Pod {
  receivedBy: string;
  signed: boolean;
  photos: number;
  /** Photo ids taken at the stop; each uploads from the phone when it has signal (may arrive after the POD). */
  photoIds?: string[];
  lines: PodLine[];
  note?: string;
  /** The 6-digit delivery code the driver typed in. */
  code?: string;
  /** Why there is no code (the receiver couldn't give one). */
  noCode?: string;
  /** Set by the server: the code matched the order's code. */
  codeOk?: boolean;
}
export interface StopRecord {
  orderId: string;
  vehicleId: string;
  arrivedAt?: string; // demo-clock HH:MM
  deliveredAt?: string;
  pod?: Pod;
  problem?: { reason: string; tempC?: number; note?: string };
  recordedAt: string; // release time until the first device event, then device wall-clock ISO
  syncedAt: string; // server wall-clock ISO when received
}

export interface Receipt {
  orderId: string;
  confirmedAt: string;
  by: string;
  /** receivedQty = arrived at the store; damagedQty = of those, arrived damaged. */
  lines: { skuId: string; name: string; driverQty: number; receivedQty: number; damagedQty?: number }[];
  issues: { type: string; note?: string }[];
  /** Photos the store took at receipt. */
  photoIds?: string[];
}

export interface Notice {
  id: string;
  outletId: string;
  orderId?: string;
  kind: "order_confirmed" | "deferral" | "shortfall" | "delivered" | "eta" | "late";
  title: string;
  body: string;
  at: string;
  acknowledged?: "ok" | "reduce" | null;
  /** Late notices: how many minutes late the stop was predicted to be. */
  lateMin?: number;
}

export interface DispatchException {
  id: string;
  depot: Depot;
  kind: "shortfall" | "failed_stop" | "receipt_issue" | "delivered_with_issue" | "dwell" | "pod_code" | "late_reply";
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

/** Sent with every driver sync (and the 20 s heartbeat) besides the events themselves. */
export interface SyncExtras {
  position?: Position;
  connectivity?: { id: string; state: "offline" | "online"; at: string }[];
  /** queued = records on the phone not yet synced, including the ones in this request. */
  check?: { syncedIds: string[]; queued: number; rejected: number; oldestQueuedAt?: string; photosQueued?: number };
}

export interface SyncResult {
  accepted: string[];
  duplicates: string[];
  /**
   * Events the server refused. `retry` = the refusal may clear on its own (the loader hasn't released the
   * trip yet), so the phone keeps the record queued; otherwise it is shown to the driver as "not accepted".
   */
  rejected: { id: string; reason: string; retry?: boolean }[];
  planVersion: number;
  /** Ids the phone marked as synced that the database doesn't have: the phone queues them again. */
  missing?: string[];
}

/** A store's new order; the delivery date and the person placing it come from the server. */
export interface PlaceOrderInput {
  outletId: string;
  temp: Temp;
  lines: { skuId: string; qty: number }[];
}

/** Where a dispatcher moves an order: the planner's MoveTarget without `by`, which comes from the session. */
export type MoveRequest = { tripId: string } | { newTripOn: string } | { defer: true; code?: DeferralCode; note?: string };

/** What a loader sends when flagging a line; the rest of the Shortfall is filled in by the server. */
export type ShortfallInput = Pick<Shortfall, "tripId" | "orderId" | "skuId" | "loaded" | "kind" | "decision" | "photo" | "photoIds">;

/**
 * The contract between the web app and the API (apps/api). HttpApi in apps/web implements it
 * against the endpoints in docs/INTEGRATION.md. The acting user always comes from the session,
 * never from the arguments.
 */
export interface WaypointApi {
  snapshot(): Promise<Db>;
  placeOrder(input: PlaceOrderInput): Promise<Order>;
  closeOrdersAndPlan(depot: Depot): Promise<Plan>;
  replan(depot: Depot): Promise<Plan>;
  moveOrder(depot: Depot, orderId: string, target: MoveRequest): Promise<{ ok: boolean; violations: Violation[]; warnings: string[] }>;
  publishPlan(depot: Depot): Promise<Plan>;
  setVehicleStatus(vehicleId: string, status: VehicleStatus): Promise<void>;
  setLoadLine(tripId: string, key: string, loaded: number): Promise<void>;
  flagShortfall(input: ShortfallInput): Promise<Shortfall>;
  releaseTrip(tripId: string): Promise<void>;
  resolveShortfall(id: string, resolution: NonNullable<Shortfall["resolution"]>): Promise<void>;
  syncDriverEvents(vehicleId: string, events: DriverEvent[], extras?: SyncExtras): Promise<SyncResult>;
  /** Online pre-check of a delivery code at the stop (the server checks it again on sync). */
  checkCode(orderId: string, code: string): Promise<{ ok: boolean; attemptsLeft: number }>;
  /** Uploads a photo (idempotent on the client-made id). */
  uploadPhoto(id: string, kind: PhotoKind, orderId: string, image: Blob): Promise<PhotoMeta>;
  ackNotice(id: string, response: "ok" | "reduce"): Promise<void>;
  confirmReceipt(receipt: Omit<Receipt, "confirmedAt" | "by">): Promise<void>;
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
