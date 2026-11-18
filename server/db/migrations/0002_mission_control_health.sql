CREATE TYPE "public"."ignore_reason" AS ENUM('irrelevant', 'duplicate', 'spam');--> statement-breakpoint
CREATE TYPE "public"."ingest_run_status" AS ENUM('running', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."post_outcome" AS ENUM('used', 'ignored');--> statement-breakpoint
CREATE TABLE "data_groups" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"fetchers" text[] DEFAULT '{}'::text[] NOT NULL,
	"tables" text[] DEFAULT '{}'::text[] NOT NULL,
	"stale_minutes" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fetcher" text NOT NULL,
	"source_id" uuid,
	"status" "ingest_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"posts_in" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "raw_posts" ADD COLUMN "outcome" "post_outcome";--> statement-breakpoint
ALTER TABLE "raw_posts" ADD COLUMN "outcome_reason" "ignore_reason";--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_runs_fetcher_idx" ON "ingest_runs" USING btree ("fetcher","started_at");--> statement-breakpoint
CREATE INDEX "raw_posts_recent_idx" ON "raw_posts" USING btree ("created_at");