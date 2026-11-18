CREATE TYPE "public"."item_action" AS ENUM('verify', 'hide', 'unhide', 'recategorize');--> statement-breakpoint
CREATE TYPE "public"."item_flag" AS ENUM('conflict', 'low_confidence', 'unverified_high_stakes');--> statement-breakpoint
CREATE TABLE "item_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"staff_id" uuid,
	"by_name" text NOT NULL,
	"action" "item_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "flag" "item_flag";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item_actions" ADD CONSTRAINT "item_actions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_actions" ADD CONSTRAINT "item_actions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_actions_item_idx" ON "item_actions" USING btree ("item_id","created_at");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_verified_by_staff_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;