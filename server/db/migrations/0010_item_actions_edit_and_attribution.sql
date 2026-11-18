ALTER TYPE "public"."item_action" ADD VALUE 'edit';--> statement-breakpoint
ALTER TYPE "public"."item_action" ADD VALUE 'return_to_review';--> statement-breakpoint
ALTER TABLE "item_actions" ADD COLUMN "collector_id" uuid;--> statement-breakpoint
ALTER TABLE "raw_posts" ADD COLUMN "staff_id" uuid;--> statement-breakpoint
ALTER TABLE "item_actions" ADD CONSTRAINT "item_actions_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_posts" ADD CONSTRAINT "raw_posts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;