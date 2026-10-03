// Contract between the API's /api/people endpoints and apps/admin, the Waypoint People (HR) panel. Types only.
import type { Depot, Role } from "./domain/types";

export type JobRole = "driver" | "loader" | "dispatcher" | "store_manager" | "hr_officer";
export type StaffStatus = "active" | "on_leave" | "left";

export const JOB_ROLES: JobRole[] = ["driver", "loader", "dispatcher", "store_manager", "hr_officer"];

export const JOB_LABEL: Record<JobRole, string> = {
  driver: "Driver",
  loader: "Loader",
  dispatcher: "Dispatcher",
  store_manager: "Store manager",
  hr_officer: "HR officer",
};

/** Which app role a login for this job gets. HR officers keep the internal `admin` key. */
export const APP_ROLE: Record<JobRole, Role> = {
  driver: "driver",
  loader: "loader",
  dispatcher: "dispatcher",
  store_manager: "store",
  hr_officer: "admin",
};

export interface StaffLogin {
  userId: string;
  username: string;
  active: boolean;
  lastLoginAt: string | null;
  sessions: number;
}

export interface StaffRow {
  id: string;
  name: string;
  jobRole: JobRole;
  depotId: Depot;
  outletId: string | null;
  /** "OUT007 Rajagiriya", for store managers. */
  outletName: string | null;
  phone: string | null;
  email: string | null;
  emergencyContact: string | null;
  status: StaffStatus;
  leaveUntil: string | null;
  startedOn: string | null;
  leftOn: string | null;
  /** A seeded demo person, not a real employee. */
  synthetic: boolean;
  /** Drivers only: the operational driver record, its licence and the vehicle dispatch assigned. */
  driver: { id: string; licenseNo: string | null; licenseClass: string | null; licenseExpiry: string | null; vehicleId: string | null } | null;
  login: StaffLogin | null;
}

export interface Renewal {
  staffId: string;
  name: string;
  depotId: Depot;
  licenseNo: string | null;
  licenseExpiry: string;
  /** Negative when already expired. */
  days: number;
}

export interface PeopleOverview {
  /** The real calendar date the panel counts from (licences, leave). */
  today: string;
  headcount: { total: number; active: number; onLeave: number; left: number };
  /** Current staff (not left) by depot and job. */
  roster: { depot: Depot; name: string; byRole: Record<JobRole, number>; onLeave: number }[];
  renewals: Renewal[];
  onLeave: { staffId: string; name: string; jobRole: JobRole; depotId: Depot; leaveUntil: string | null }[];
  /** Current staff who can't sign in yet. */
  noLogin: { staffId: string; name: string; jobRole: JobRole; depotId: Depot }[];
  joiners: { staffId: string; name: string; jobRole: JobRole; depotId: Depot; startedOn: string }[];
  access: { active: number; disabled: number; signedInToday: number };
  activity: PeopleActivity[];
}

export interface PeopleActivity {
  id: number;
  at: string;
  actor: string;
  role: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  summary: string;
}

export interface PeopleLookups {
  depots: { id: Depot; name: string }[];
  outlets: { id: string; depot: Depot; label: string; active: boolean }[];
}
