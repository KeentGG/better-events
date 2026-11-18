ALTER TABLE "items" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "parent_item_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_parent_item_id_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_place_idx" ON "items" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "items_event_idx" ON "items" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "items_parent_idx" ON "items" USING btree ("parent_item_id");