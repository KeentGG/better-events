-- Overlapping classifier runs could publish one post twice; keep the first item of each post before enforcing one.
-- Items from posts are never referenced by event_updates or kiosks, and item_actions cascades.
DELETE FROM "items" a USING "items" b
WHERE a."raw_post_id" = b."raw_post_id" AND (a."created_at", a."id") > (b."created_at", b."id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_raw_post_uq" ON "items" USING btree ("raw_post_id");
