"use client";
import type { WaypointApi } from "@waypoint/core/contract";
import { httpApi, subscribeServer } from "./http";

/** The single seam between UI and server (apps/api). No component talks to fetch directly. */
export const api: WaypointApi = httpApi;
export { subscribeServer };
export * from "@waypoint/core/contract";
