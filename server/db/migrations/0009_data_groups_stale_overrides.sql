-- Groups now live in code (server/control/config.ts); data_groups keeps only stale windows staff changed.
-- Rows still at the old seeded default are not overrides, so they go and later default changes apply.
DELETE FROM "data_groups" WHERE ("key", "stale_minutes") IN (
  ('weather', 30), ('schedule', 120), ('traffic', 15), ('closures', 30), ('safety', 60), ('kiosks', 1440),
  ('sponsor_games', 360), ('third_party_events', 360), ('winners', 1440), ('promos', 360), ('tips', 4320), ('crowd_reports', 15)
);--> statement-breakpoint
-- The Kiosks group became Places.
UPDATE "data_groups" SET "key" = 'places' WHERE "key" = 'kiosks';--> statement-breakpoint
ALTER TABLE "data_groups" DROP COLUMN "label";--> statement-breakpoint
ALTER TABLE "data_groups" DROP COLUMN "categories";--> statement-breakpoint
ALTER TABLE "data_groups" DROP COLUMN "fetchers";--> statement-breakpoint
ALTER TABLE "data_groups" DROP COLUMN "tables";--> statement-breakpoint
ALTER TABLE "data_groups" DROP COLUMN "position";