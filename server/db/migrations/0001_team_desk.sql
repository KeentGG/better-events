ALTER TABLE "events" ADD COLUMN "kind" text DEFAULT 'ceremony' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "official" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "collector_id" uuid;--> statement-breakpoint
ALTER TABLE "kiosks" ADD COLUMN "place" text;--> statement-breakpoint
ALTER TABLE "kiosks" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "kiosks" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "kiosks" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;