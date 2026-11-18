-- The table has always held every Around place (promo, ride, thrift, food, kiosk), not only kiosks.
ALTER TABLE "kiosks" RENAME TO "places";--> statement-breakpoint
ALTER TABLE "places" RENAME CONSTRAINT "kiosks_pkey" TO "places_pkey";--> statement-breakpoint
ALTER TABLE "places" RENAME CONSTRAINT "kiosks_area_id_areas_id_fk" TO "places_area_id_areas_id_fk";--> statement-breakpoint
ALTER TABLE "places" RENAME CONSTRAINT "kiosks_item_id_items_id_fk" TO "places_item_id_items_id_fk";--> statement-breakpoint
-- The places editor always sets a kind; older rows without one were shown as kiosks.
UPDATE "places" SET "kind" = 'kiosk' WHERE "kind" IS NULL;
