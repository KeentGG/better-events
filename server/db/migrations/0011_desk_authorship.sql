ALTER TABLE "events" ADD COLUMN "created_by_collector_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "created_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "updated_by_collector_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "updated_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "staff_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "created_by_collector_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "created_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "updated_by_collector_id" uuid;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "updated_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_collector_id_collectors_id_fk" FOREIGN KEY ("created_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_collector_id_collectors_id_fk" FOREIGN KEY ("updated_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_created_by_collector_id_collectors_id_fk" FOREIGN KEY ("created_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_updated_by_collector_id_collectors_id_fk" FOREIGN KEY ("updated_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_updates_item_idx" ON "event_updates" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_one_desk_author_ck" CHECK ("items"."collector_id" is null or "items"."staff_id" is null);