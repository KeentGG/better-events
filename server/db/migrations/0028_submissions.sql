CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"body" jsonb NOT NULL,
	"summary" text NOT NULL,
	"ip_hash" text NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_staff_id" uuid,
	"reviewed_by_collector_id" uuid,
	"reviewed_by_name" text,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_staff_id_staff_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_collector_id_collectors_id_fk" FOREIGN KEY ("reviewed_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "submissions_sender_idx" ON "submissions" USING btree ("ip_hash","created_at");