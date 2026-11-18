CREATE TABLE "result_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" uuid NOT NULL,
	"event_id" uuid,
	"contest" text NOT NULL,
	"stage" text NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"expected_at" timestamp with time zone,
	"item_id" uuid,
	"collector_id" uuid,
	"staff_id" uuid,
	"by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_versions_one_author_ck" CHECK ("result_versions"."collector_id" is null or "result_versions"."staff_id" is null)
);
--> statement-breakpoint
ALTER TABLE "result_versions" ADD CONSTRAINT "result_versions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_versions" ADD CONSTRAINT "result_versions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_versions" ADD CONSTRAINT "result_versions_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_versions" ADD CONSTRAINT "result_versions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "result_versions_contest_idx" ON "result_versions" USING btree ("contest_id","created_at");--> statement-breakpoint
CREATE INDEX "result_versions_event_idx" ON "result_versions" USING btree ("event_id","created_at");