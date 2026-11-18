ALTER TYPE "public"."item_action" ADD VALUE 'retime';--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "original_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "original_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "time_change" text;