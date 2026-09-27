CREATE TYPE "public"."driver_status" AS ENUM('active', 'on_leave', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'dispatcher', 'loader', 'driver', 'store');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('available', 'in_workshop');--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"actor" text NOT NULL,
	"role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"summary" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "calendar_days" (
	"date" text PRIMARY KEY NOT NULL,
	"dow" integer NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"payday" boolean NOT NULL,
	"festival" text,
	"festival_ramp" double precision NOT NULL,
	"holiday" boolean NOT NULL,
	"monsoon" boolean NOT NULL,
	"operating" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deferral_log" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"order_id" text NOT NULL,
	"date" text NOT NULL,
	"outlet_id" text NOT NULL,
	"brand" text NOT NULL,
	"temp" text NOT NULL,
	"volume_m_3" double precision NOT NULL,
	"code" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by" text NOT NULL,
	"store_notified" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "depots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"district" text NOT NULL,
	"address" text,
	"phone" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "district_travel" (
	"district" text NOT NULL,
	"depot_id" text NOT NULL,
	"road_class" text NOT NULL,
	"free_flow_kmh" double precision NOT NULL,
	"depot_to_district_km" double precision NOT NULL,
	"depot_to_district_min" double precision NOT NULL,
	"inter_stop_km" double precision NOT NULL,
	"inter_stop_min" double precision NOT NULL,
	CONSTRAINT "district_travel_district_depot_id_pk" PRIMARY KEY("district","depot_id")
);
--> statement-breakpoint
CREATE TABLE "driver_events" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"vehicle_id" text,
	"order_id" text,
	"kind" text,
	"device_at" text,
	"recorded_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "driver_sync" (
	"vehicle_id" text PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp with time zone NOT NULL,
	"last_plan_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"license_no" text,
	"license_class" text,
	"license_expiry" text,
	"depot_id" text NOT NULL,
	"vehicle_id" text,
	"status" "driver_status" DEFAULT 'active' NOT NULL,
	"hired_on" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"depot_id" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"ref" jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "load_lines" (
	"trip_id" text NOT NULL,
	"line_key" text NOT NULL,
	"planned" integer NOT NULL,
	"loaded" integer NOT NULL,
	CONSTRAINT "load_lines_trip_id_line_key_pk" PRIMARY KEY("trip_id","line_key")
);
--> statement-breakpoint
CREATE TABLE "loads" (
	"trip_id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"plan_version" integer NOT NULL,
	"changed_version" integer,
	"status" text NOT NULL,
	"released_at" timestamp with time zone,
	"released_by" text
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"outlet_id" text NOT NULL,
	"order_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"acknowledged" text
);
--> statement-breakpoint
CREATE TABLE "ops_days" (
	"depot_id" text PRIMARY KEY NOT NULL,
	"orders_closed" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"order_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "order_lines_order_id_sku_id_pk" PRIMARY KEY("order_id","sku_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"depot_id" text NOT NULL,
	"brand" text NOT NULL,
	"temp" text NOT NULL,
	"units" integer NOT NULL,
	"weight_kg" double precision NOT NULL,
	"volume_m_3" double precision NOT NULL,
	"deferred_yesterday" boolean NOT NULL,
	"days_since_last_served" integer NOT NULL,
	"source" text NOT NULL,
	"for_date" text,
	"created_at" timestamp with time zone,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"district" text NOT NULL,
	"depot_id" text NOT NULL,
	"dock_type" text NOT NULL,
	"parking" text NOT NULL,
	"mall_window" text,
	"window_open" text NOT NULL,
	"window_close" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_deferrals" (
	"depot_id" text NOT NULL,
	"order_id" text NOT NULL,
	"code" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"decided_by" text NOT NULL,
	"decided_at" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "plan_deferrals_depot_id_order_id_pk" PRIMARY KEY("depot_id","order_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"depot_id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"brand" text NOT NULL,
	"temp" text NOT NULL,
	"weight_kg" double precision NOT NULL,
	"volume_m_3" double precision NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"order_id" text PRIMARY KEY NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"by" text NOT NULL,
	"lines" jsonb NOT NULL,
	"issues" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "road_conditions" (
	"district" text PRIMARY KEY NOT NULL,
	"disruption_index" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_allowance" (
	"brand" text NOT NULL,
	"dock_type" text NOT NULL,
	"minutes" double precision NOT NULL,
	CONSTRAINT "service_allowance_brand_dock_type_pk" PRIMARY KEY("brand","dock_type")
);
--> statement-breakpoint
CREATE TABLE "service_history" (
	"outlet_id" text PRIMARY KEY NOT NULL,
	"days" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"app" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shortfalls" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"trip_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"order_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"name" text NOT NULL,
	"planned" integer NOT NULL,
	"loaded" integer NOT NULL,
	"kind" text NOT NULL,
	"decision" text NOT NULL,
	"photo" boolean NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"resolution" text,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "stop_records" (
	"order_id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"arrived_at" text,
	"delivered_at" text,
	"pod" jsonb,
	"problem" jsonb,
	"recorded_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"trip_id" text NOT NULL,
	"seq" integer NOT NULL,
	"order_id" text NOT NULL,
	CONSTRAINT "trip_stops_trip_id_seq_pk" PRIMARY KEY("trip_id","seq")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"depot_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"trip_no" integer NOT NULL,
	"brand" text NOT NULL,
	"district" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "role" NOT NULL,
	"depot_id" text,
	"outlet_id" text,
	"outlet_scope" text,
	"driver_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_driverId_unique" UNIQUE("driver_id")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"plate_no" text,
	"type" text NOT NULL,
	"temp" text NOT NULL,
	"weight_cap_kg" double precision NOT NULL,
	"volume_cap_m_3" double precision NOT NULL,
	"fuel_type" text NOT NULL,
	"km_per_l" double precision NOT NULL,
	"weekly_fuel_quota_l" double precision NOT NULL,
	"depot_id" text NOT NULL,
	"status" "vehicle_status" DEFAULT 'available' NOT NULL,
	"fuel_used_week_l" double precision DEFAULT 0 NOT NULL,
	"fuel_used_week_km" double precision DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_volume" (
	"depot_id" text NOT NULL,
	"brand" text NOT NULL,
	"week" text NOT NULL,
	"total_m_3" double precision NOT NULL,
	"chilled_m_3" double precision NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "weekly_volume_depot_id_brand_week_pk" PRIMARY KEY("depot_id","brand","week")
);
--> statement-breakpoint
ALTER TABLE "deferral_log" ADD CONSTRAINT "deferral_log_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "district_travel" ADD CONSTRAINT "district_travel_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_sync" ADD CONSTRAINT "driver_sync_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_lines" ADD CONSTRAINT "load_lines_trip_id_loads_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."loads"("trip_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_days" ADD CONSTRAINT "ops_days_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_deferrals" ADD CONSTRAINT "plan_deferrals_depot_id_plans_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."plans"("depot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_deferrals" ADD CONSTRAINT "plan_deferrals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_history" ADD CONSTRAINT "service_history_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_records" ADD CONSTRAINT "stop_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_records" ADD CONSTRAINT "stop_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_depot_id_plans_depot_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."plans"("depot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_index" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_entity_id_index" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "deferral_log_outlet_id_index" ON "deferral_log" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "driver_events_vehicle_id_index" ON "driver_events" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "drivers_depot_id_index" ON "drivers" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "drivers_vehicle_id_index" ON "drivers" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "notices_outlet_id_index" ON "notices" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "orders_outlet_id_index" ON "orders" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "orders_depot_id_for_date_index" ON "orders" USING btree ("depot_id","for_date");--> statement-breakpoint
CREATE INDEX "outlets_depot_id_index" ON "outlets" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trips_depot_id_index" ON "trips" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "trips_vehicle_id_index" ON "trips" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "users_role_index" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "vehicles_depot_id_index" ON "vehicles" USING btree ("depot_id");