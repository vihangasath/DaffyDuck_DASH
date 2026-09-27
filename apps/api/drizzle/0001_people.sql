CREATE TYPE "public"."staff_role" AS ENUM('driver', 'loader', 'dispatcher', 'store_manager', 'hr_officer');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('active', 'on_leave', 'left');--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"job_role" "staff_role" NOT NULL,
	"depot_id" text NOT NULL,
	"outlet_id" text,
	"driver_id" text,
	"phone" text,
	"email" text,
	"emergency_contact" text,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"leave_until" text,
	"started_on" text,
	"left_on" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_driverId_unique" UNIQUE("driver_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "staff_id" text;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_job_role_index" ON "staff" USING btree ("job_role");--> statement-breakpoint
CREATE INDEX "staff_depot_id_index" ON "staff" USING btree ("depot_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_staffId_unique" UNIQUE("staff_id");