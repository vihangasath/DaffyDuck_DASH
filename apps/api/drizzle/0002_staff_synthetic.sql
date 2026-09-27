ALTER TABLE "staff" ADD COLUMN "synthetic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Every staff row that exists before this migration came from the seed.
UPDATE "staff" SET "synthetic" = true;