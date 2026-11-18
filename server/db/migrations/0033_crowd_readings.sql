CREATE TABLE "crowd_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"level" text NOT NULL,
	"note" text,
	"collector_id" uuid,
	"staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crowd_readings_one_author_ck" CHECK ("crowd_readings"."collector_id" is null or "crowd_readings"."staff_id" is null)
);
--> statement-breakpoint
ALTER TABLE "crowd_readings" ADD CONSTRAINT "crowd_readings_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_readings" ADD CONSTRAINT "crowd_readings_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_readings" ADD CONSTRAINT "crowd_readings_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crowd_readings_area_idx" ON "crowd_readings" USING btree ("area_id","created_at");