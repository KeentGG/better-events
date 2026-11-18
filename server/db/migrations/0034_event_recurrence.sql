ALTER TABLE "events" ADD COLUMN "repeat_until" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "skip_dates" date[] DEFAULT '{}'::date[] NOT NULL;