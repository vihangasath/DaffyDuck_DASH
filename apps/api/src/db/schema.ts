// Waypoint relational schema. Four groups:
//   master data    depots, outlets (branches), vehicles, drivers, products, travel/calendar/history
//   people         staff: one HR record per employee, every role (Waypoint People)
//   access         users, sessions
//   operations     orders → plans/trips → loads → stop records → receipts, plus notices, exceptions,
//                  driver events (idempotent sync log), deferral log and the audit log
// Timestamps are stored as ISO strings in `timestamptz` columns (mode "string").
import { sql } from "drizzle-orm";
import { bigserial, boolean, customType, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name?: string) => (name ? timestamp(name, { withTimezone: true, mode: "string" }) : timestamp({ withTimezone: true, mode: "string" }));
const created = () => ts().notNull().defaultNow();
/** Raw bytes (photos). PGlite hands back a Uint8Array, node-postgres a Buffer. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => "bytea" });

export const roleEnum = pgEnum("role", ["admin", "dispatcher", "loader", "driver", "store"]);
export const vehicleStatusEnum = pgEnum("vehicle_status", ["available", "in_workshop"]);
export const driverStatusEnum = pgEnum("driver_status", ["active", "on_leave", "inactive"]);
export const staffRoleEnum = pgEnum("staff_role", ["driver", "loader", "dispatcher", "store_manager", "hr_officer"]);
export const staffStatusEnum = pgEnum("staff_status", ["active", "on_leave", "left"]);

// ── Master data ────────────────────────────────────────────────────────────────────────────────

export const depots = pgTable("depots", {
  id: text().primaryKey(),
  name: text().notNull(),
  district: text().notNull(),
  address: text(),
  phone: text(),
  lat: doublePrecision().notNull(),
  lng: doublePrecision().notNull(),
  updatedAt: created(),
});

export const outlets = pgTable(
  "outlets",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    brand: text().notNull(),
    district: text().notNull(),
    depotId: text().notNull().references(() => depots.id),
    dockType: text().notNull(),
    parking: text().notNull(),
    mallWindow: text(),
    windowOpen: text().notNull(),
    windowClose: text().notNull(),
    lat: doublePrecision(),
    lng: doublePrecision(),
    phone: text(),
    active: boolean().notNull().default(true),
    createdAt: created(),
    updatedAt: created(),
  },
  (t) => [index().on(t.depotId)],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: text().primaryKey(),
    plateNo: text(),
    type: text().notNull(), // truck | van
    temp: text().notNull(), // reefer | ambient
    weightCapKg: doublePrecision().notNull(),
    volumeCapM3: doublePrecision().notNull(),
    fuelType: text().notNull(),
    kmPerL: doublePrecision().notNull(),
    weeklyFuelQuotaL: doublePrecision().notNull(),
    depotId: text().notNull().references(() => depots.id),
    status: vehicleStatusEnum().notNull().default("available"),
    fuelUsedWeekL: doublePrecision().notNull().default(0),
    fuelUsedWeekKm: doublePrecision().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: created(),
    updatedAt: created(),
  },
  (t) => [index().on(t.depotId)],
);

export const drivers = pgTable(
  "drivers",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    phone: text(),
    licenseNo: text(),
    licenseClass: text(),
    licenseExpiry: text(), // YYYY-MM-DD
    depotId: text().notNull().references(() => depots.id),
    vehicleId: text().references(() => vehicles.id, { onDelete: "set null" }),
    status: driverStatusEnum().notNull().default("active"),
    hiredOn: text(),
    createdAt: created(),
    updatedAt: created(),
  },
  (t) => [index().on(t.depotId), index().on(t.vehicleId)],
);

export const products = pgTable("products", {
  id: text().primaryKey(),
  name: text().notNull(),
  unit: text().notNull(),
  brand: text().notNull(),
  temp: text().notNull(),
  weightKg: doublePrecision().notNull(),
  volumeM3: doublePrecision().notNull(),
  active: boolean().notNull().default(true),
  createdAt: created(),
  updatedAt: created(),
});

export const districtTravel = pgTable(
  "district_travel",
  {
    district: text().notNull(),
    depotId: text().notNull().references(() => depots.id),
    roadClass: text().notNull(),
    freeFlowKmh: doublePrecision().notNull(),
    depotToDistrictKm: doublePrecision().notNull(),
    depotToDistrictMin: doublePrecision().notNull(),
    interStopKm: doublePrecision().notNull(),
    interStopMin: doublePrecision().notNull(),
  },
  (t) => [primaryKey({ columns: [t.district, t.depotId] })],
);

export const serviceAllowance = pgTable(
  "service_allowance",
  { brand: text().notNull(), dockType: text().notNull(), minutes: doublePrecision().notNull() },
  (t) => [primaryKey({ columns: [t.brand, t.dockType] })],
);

export const calendarDays = pgTable("calendar_days", {
  date: text().primaryKey(),
  dow: integer().notNull(),
  isoYear: integer().notNull(),
  isoWeek: integer().notNull(),
  payday: boolean().notNull(),
  festival: text(),
  festivalRamp: doublePrecision().notNull(),
  holiday: boolean().notNull(),
  monsoon: boolean().notNull(),
  operating: boolean().notNull(),
});

export const roadConditions = pgTable("road_conditions", { district: text().primaryKey(), disruptionIndex: doublePrecision().notNull() });

export const serviceHistory = pgTable("service_history", {
  outletId: text().primaryKey().references(() => outlets.id),
  days: text().notNull(), // one letter per day: S served, D deferred, N no order
});

export const weeklyVolume = pgTable(
  "weekly_volume",
  {
    depotId: text().notNull(),
    brand: text().notNull(),
    week: text().notNull(),
    totalM3: doublePrecision().notNull(),
    chilledM3: doublePrecision().notNull(),
    kind: text().notNull(), // actual | forecast
  },
  (t) => [primaryKey({ columns: [t.depotId, t.brand, t.week] })],
);

/** Small key/value facts about the dataset (demo date, history window, forecast weeks). */
export const appMeta = pgTable("app_meta", { key: text().primaryKey(), value: jsonb().notNull() });

// ── People ─────────────────────────────────────────────────────────────────────────────────────

/** One record per employee, kept by HR. A driver's record points at the operational driver row (licence, vehicle). */
export const staff = pgTable(
  "staff",
  {
    id: text().primaryKey(), // EMP0001
    name: text().notNull(),
    jobRole: staffRoleEnum().notNull(),
    depotId: text().notNull().references(() => depots.id),
    outletId: text().references(() => outlets.id), // store managers
    driverId: text()
      .unique()
      .references(() => drivers.id, { onDelete: "set null" }),
    phone: text(),
    email: text(),
    emergencyContact: text(),
    status: staffStatusEnum().notNull().default("active"),
    leaveUntil: text(), // YYYY-MM-DD, while on leave
    startedOn: text(),
    leftOn: text(),
    /** Seeded demo person (the datasets don't identify people); records HR adds are real. */
    synthetic: boolean().notNull().default(false),
    createdAt: created(),
    updatedAt: created(),
  },
  (t) => [index().on(t.jobRole), index().on(t.depotId)],
);

// ── Access ─────────────────────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: text().primaryKey(),
    username: text().notNull().unique(),
    passwordHash: text().notNull(),
    displayName: text().notNull(),
    role: roleEnum().notNull(),
    depotId: text().references(() => depots.id),
    outletId: text().references(() => outlets.id),
    outletScope: text(), // store managers: outlet | depot
    driverId: text()
      .unique()
      .references(() => drivers.id, { onDelete: "set null" }),
    staffId: text()
      .unique()
      .references(() => staff.id, { onDelete: "set null" }),
    active: boolean().notNull().default(true),
    mustChangePassword: boolean().notNull().default(false),
    lastLoginAt: ts(),
    createdAt: created(),
    updatedAt: created(),
  },
  (t) => [index().on(t.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    tokenHash: text().notNull().unique(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    app: text().notNull(), // web | admin
    userAgent: text(),
    createdAt: created(),
    lastSeenAt: created(),
    expiresAt: ts().notNull(),
  },
  (t) => [index().on(t.userId)],
);

// ── Operations ─────────────────────────────────────────────────────────────────────────────────

export const orders = pgTable(
  "orders",
  {
    id: text().primaryKey(),
    outletId: text()
      .notNull()
      .references(() => outlets.id),
    depotId: text().notNull(),
    brand: text().notNull(),
    temp: text().notNull(),
    units: integer().notNull(),
    weightKg: doublePrecision().notNull(),
    volumeM3: doublePrecision().notNull(),
    deferredYesterday: boolean().notNull(),
    daysSinceLastServed: integer().notNull(),
    source: text().notNull(),
    forDate: text(), // YYYY-MM-DD, or "next-run" after the cutoff
    createdAt: ts(),
    createdBy: text(),
    confirmCode: text(), // 6-digit delivery code the store gives the driver
  },
  (t) => [index().on(t.outletId), index().on(t.depotId, t.forDate)],
);

export const orderLines = pgTable(
  "order_lines",
  {
    orderId: text()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    skuId: text().notNull(),
    name: text().notNull(),
    unit: text().notNull(),
    qty: integer().notNull(),
    position: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.skuId] })],
);

export const opsDays = pgTable("ops_days", {
  depotId: text()
    .primaryKey()
    .references(() => depots.id),
  ordersClosed: boolean().notNull().default(false),
  closedAt: ts(),
  closedBy: text(),
});

/** The current plan per depot. Every change bumps `version`; the audit log keeps the history. */
export const plans = pgTable("plans", {
  depotId: text()
    .primaryKey()
    .references(() => depots.id),
  date: text().notNull(),
  version: integer().notNull(),
  status: text().notNull(), // draft | published
  publishedAt: ts(),
});

export const trips = pgTable(
  "trips",
  {
    id: text().primaryKey(),
    depotId: text()
      .notNull()
      .references(() => plans.depotId, { onDelete: "cascade" }),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id),
    tripNo: integer().notNull(),
    brand: text().notNull(),
    district: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [index().on(t.depotId), index().on(t.vehicleId)],
);

export const tripStops = pgTable(
  "trip_stops",
  {
    tripId: text()
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    seq: integer().notNull(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.seq] })],
);

export const planDeferrals = pgTable(
  "plan_deferrals",
  {
    depotId: text()
      .notNull()
      .references(() => plans.depotId, { onDelete: "cascade" }),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    code: text().notNull(),
    reason: text().notNull(),
    note: text(),
    decidedBy: text().notNull(),
    decidedAt: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.depotId, t.orderId] })],
);

export const loads = pgTable("loads", {
  tripId: text().primaryKey(),
  vehicleId: text()
    .notNull()
    .references(() => vehicles.id),
  planVersion: integer().notNull(),
  changedVersion: integer(),
  status: text().notNull(), // not_started | loading | held | released
  releasedAt: ts(),
  releasedBy: text(),
});

export const loadLines = pgTable(
  "load_lines",
  {
    tripId: text()
      .notNull()
      .references(() => loads.tripId, { onDelete: "cascade" }),
    lineKey: text().notNull(), // orderId|skuId
    planned: integer().notNull(),
    loaded: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.lineKey] })],
);

export const shortfalls = pgTable("shortfalls", {
  id: text().primaryKey(),
  seq: bigserial({ mode: "number" }).notNull(),
  tripId: text().notNull(),
  vehicleId: text()
    .notNull()
    .references(() => vehicles.id),
  orderId: text()
    .notNull()
    .references(() => orders.id),
  outletId: text()
    .notNull()
    .references(() => outlets.id),
  skuId: text().notNull(),
  name: text().notNull(),
  planned: integer().notNull(),
  loaded: integer().notNull(),
  kind: text().notNull(),
  decision: text().notNull(),
  photo: boolean().notNull(),
  photoIds: jsonb(),
  by: text().notNull(),
  at: ts().notNull(),
  resolution: text(),
  resolvedBy: text(),
});

export const stopRecords = pgTable("stop_records", {
  orderId: text()
    .primaryKey()
    .references(() => orders.id),
  vehicleId: text()
    .notNull()
    .references(() => vehicles.id),
  arrivedAt: text(), // demo-clock HH:MM
  deliveredAt: text(),
  pod: jsonb(),
  problem: jsonb(),
  recordedAt: ts().notNull(),
  syncedAt: ts().notNull(),
});

/** Every driver event ever received, keyed by the device's UUID: the idempotency log for sync. */
export const driverEvents = pgTable(
  "driver_events",
  {
    id: text().primaryKey(),
    seq: bigserial({ mode: "number" }).notNull(),
    vehicleId: text(),
    orderId: text(),
    kind: text(),
    deviceAt: text(),
    recordedAt: ts(),
    receivedAt: created(),
    userId: text(),
    payload: jsonb(),
  },
  (t) => [index().on(t.vehicleId)],
);

export const receipts = pgTable("receipts", {
  orderId: text()
    .primaryKey()
    .references(() => orders.id),
  confirmedAt: ts().notNull(),
  by: text().notNull(),
  lines: jsonb().notNull(),
  issues: jsonb().notNull(),
  photoIds: jsonb(),
});

export const notices = pgTable(
  "notices",
  {
    id: text().primaryKey(),
    seq: bigserial({ mode: "number" }).notNull(),
    outletId: text()
      .notNull()
      .references(() => outlets.id),
    orderId: text(),
    kind: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    at: ts().notNull(),
    acknowledged: text(),
    lateMin: integer(),
  },
  (t) => [index().on(t.outletId)],
);

export const exceptions = pgTable("exceptions", {
  id: text().primaryKey(),
  seq: bigserial({ mode: "number" }).notNull(),
  depotId: text()
    .notNull()
    .references(() => depots.id),
  kind: text().notNull(),
  severity: text().notNull(),
  title: text().notNull(),
  body: text().notNull(),
  at: ts().notNull(),
  ref: jsonb().notNull(),
  resolved: boolean().notNull().default(false),
});

export const driverSync = pgTable("driver_sync", {
  vehicleId: text()
    .primaryKey()
    .references(() => vehicles.id),
  lastSyncAt: ts().notNull(),
  lastPlanVersion: integer().notNull(),
  position: jsonb(), // latest phone location fix
  trail: jsonb(), // recent fixes, oldest first
  syncCheck: jsonb(), // what the phone holds vs what reached the database
});

/** Each time a driver phone went offline or came back online (device time), uploaded on its next sync. */
export const driverConnectivity = pgTable(
  "driver_connectivity",
  {
    id: text().primaryKey(),
    seq: bigserial({ mode: "number" }).notNull(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id),
    state: text().notNull(), // offline | online
    at: ts().notNull(),
    receivedAt: ts().notNull(),
  },
  (t) => [index().on(t.vehicleId)],
);

/** Photos from the dock (shortfalls), the stop (proof of delivery) and the store (receipt). */
export const photos = pgTable(
  "photos",
  {
    id: text().primaryKey(), // made on the phone, so a retried upload is idempotent
    kind: text().notNull(), // shortfall | pod | receipt
    orderId: text()
      .notNull()
      .references(() => orders.id),
    vehicleId: text(),
    contentType: text().notNull(),
    bytes: integer().notNull(),
    data: bytea().notNull(),
    by: text().notNull(),
    userId: text(),
    at: ts().notNull(),
  },
  (t) => [index().on(t.orderId)],
);

export const deferralLog = pgTable(
  "deferral_log",
  {
    id: text().primaryKey(),
    seq: bigserial({ mode: "number" }).notNull(),
    orderId: text().notNull(),
    date: text().notNull(),
    outletId: text()
      .notNull()
      .references(() => outlets.id),
    brand: text().notNull(),
    temp: text().notNull(),
    volumeM3: doublePrecision().notNull(),
    code: text().notNull(),
    reason: text().notNull(),
    decidedBy: text().notNull(),
    storeNotified: boolean().notNull(),
  },
  (t) => [index().on(t.outletId)],
);

/** Who did what, when: every write through the API adds a row. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    at: created(),
    userId: text(),
    actor: text().notNull(),
    role: text().notNull(),
    action: text().notNull(),
    entity: text(),
    entityId: text(),
    summary: text().notNull(),
    detail: jsonb(),
  },
  (t) => [index().on(t.at), index().on(t.entity, t.entityId)],
);

export const tableOrderForReset = sql`TRUNCATE photos, driver_connectivity, ops_days, plans, trips, trip_stops, plan_deferrals, loads, load_lines, shortfalls, stop_records, driver_events, receipts, notices, exceptions, driver_sync, deferral_log, order_lines, orders RESTART IDENTITY CASCADE`;
