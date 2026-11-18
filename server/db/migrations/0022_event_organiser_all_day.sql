ALTER TABLE "events" ADD COLUMN "organiser" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "presented_by" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "time_known" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- The 3rd-party events group merged into Schedule; drop its stale-window override.
DELETE FROM "data_groups" WHERE "key" = 'third_party_events';
