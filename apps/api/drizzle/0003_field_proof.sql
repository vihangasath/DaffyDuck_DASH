CREATE TABLE "driver_connectivity" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"vehicle_id" text NOT NULL,
	"state" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"order_id" text NOT NULL,
	"vehicle_id" text,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"by" text NOT NULL,
	"user_id" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_sync" ADD COLUMN "position" jsonb;--> statement-breakpoint
ALTER TABLE "driver_sync" ADD COLUMN "trail" jsonb;--> statement-breakpoint
ALTER TABLE "driver_sync" ADD COLUMN "sync_check" jsonb;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "late_min" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirm_code" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "photo_ids" jsonb;--> statement-breakpoint
ALTER TABLE "shortfalls" ADD COLUMN "photo_ids" jsonb;--> statement-breakpoint
ALTER TABLE "driver_connectivity" ADD CONSTRAINT "driver_connectivity_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_connectivity_vehicle_id_index" ON "driver_connectivity" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "photos_order_id_index" ON "photos" USING btree ("order_id");--> statement-breakpoint
-- Orders placed before delivery codes existed get one now.
UPDATE "orders" SET "confirm_code" = lpad((floor(random() * 1000000))::int::text, 6, '0') WHERE "confirm_code" IS NULL;
