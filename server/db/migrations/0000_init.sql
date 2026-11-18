CREATE TYPE "public"."category" AS ENUM('announcement', 'schedule_change', 'delay', 'cancellation', 'winner', 'traffic_advisory', 'road_closure', 'road_reopening', 'traffic_sentiment', 'weather', 'crime_safety', 'kiosk', 'raffle', 'activity', 'other');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'delayed', 'ongoing', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('published', 'needs_review', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('facebook', 'threads', 'x', 'web', 'crowd', 'curator');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'corroborated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."traffic_level" AS ENUM('clear', 'moderate', 'heavy', 'closed');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"lat" double precision,
	"lng" double precision,
	CONSTRAINT "areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "collectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collectors_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "crowd_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "category" NOT NULL,
	"area_id" uuid,
	"note" text,
	"ip_hash" text NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"item_id" uuid,
	"kind" "category" NOT NULL,
	"note" text,
	"new_start" timestamp with time zone,
	"results" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"venue" text,
	"area_id" uuid,
	"planned_start" timestamp with time zone NOT NULL,
	"planned_end" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"status" "event_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_post_id" uuid,
	"source_id" uuid,
	"category" "category" NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"area_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"severity" smallint DEFAULT 0 NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"status" "item_status" DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kiosks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"area_id" uuid,
	"lat" double precision,
	"lng" double precision,
	"open_hours" text,
	"item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"collector_id" uuid,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"author" text,
	"text" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"payload" jsonb,
	"classified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"tier" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"level" "traffic_level" NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crowd_reports" ADD CONSTRAINT "crowd_reports_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_updates" ADD CONSTRAINT "event_updates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_updates" ADD CONSTRAINT "event_updates_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_raw_post_id_raw_posts_id_fk" FOREIGN KEY ("raw_post_id") REFERENCES "public"."raw_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosks" ADD CONSTRAINT "kiosks_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosks" ADD CONSTRAINT "kiosks_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_posts" ADD CONSTRAINT "raw_posts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_posts" ADD CONSTRAINT "raw_posts_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_readings" ADD CONSTRAINT "traffic_readings_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crowd_reports_recent_idx" ON "crowd_reports" USING btree ("area_id","created_at");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("planned_start");--> statement-breakpoint
CREATE INDEX "items_feed_idx" ON "items" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_posts_platform_external_uq" ON "raw_posts" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "raw_posts_unclassified_idx" ON "raw_posts" USING btree ("created_at") WHERE "raw_posts"."classified_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sources_platform_external_uq" ON "sources" USING btree ("platform","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_area_bucket_uq" ON "traffic_readings" USING btree ("area_id","bucket_start");