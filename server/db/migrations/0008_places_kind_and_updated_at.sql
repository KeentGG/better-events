CREATE TYPE "public"."place_kind" AS ENUM('promo', 'ride', 'thrift', 'food', 'kiosk');--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "kind" SET DATA TYPE "public"."place_kind" USING "kind"::"public"."place_kind";--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing rows have not been edited since they were added, as far as anyone can tell.
UPDATE "events" SET "updated_at" = "created_at";--> statement-breakpoint
UPDATE "places" SET "updated_at" = "created_at";
