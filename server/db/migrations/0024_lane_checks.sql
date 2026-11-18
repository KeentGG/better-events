CREATE TABLE "lane_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lane" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"note" text,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"collector_id" uuid,
	"staff_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lane_checks_one_author_ck" CHECK ("lane_checks"."collector_id" is null or "lane_checks"."staff_id" is null)
);
--> statement-breakpoint
ALTER TABLE "lane_checks" ADD CONSTRAINT "lane_checks_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lane_checks" ADD CONSTRAINT "lane_checks_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lane_checks_lane_idx" ON "lane_checks" USING btree ("lane","checked_at");--> statement-breakpoint
-- Traffic's default window moved from 15 to 60 minutes. A row still at 15 is the old default, not a choice.
DELETE FROM "data_groups" WHERE "key" = 'traffic' AND "stale_minutes" = 15;