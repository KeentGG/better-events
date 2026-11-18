-- Pin a clone of the festival database to Saturday 17 October 2026, 9 PM in Bacolod.
--
-- Run it with psql against a COPY, never production. scripts/demo-db.sh does that for masskara_demo:
--   \set pin '2026-10-17 21:00+08'
-- Rows created after the pin go, in foreign-key order; weather goes entirely and demo-weather.ts puts
-- that night's archive forecast back. Identity and configuration rows (staff, collectors, sources,
-- place_kinds) stay, so existing bearer tokens keep signing in and surviving rows keep their labels.
\set ON_ERROR_STOP on
\set pin '2026-10-17 21:00+08'

-- First statement: refuse anything whose name does not say it is a demo, whatever the connection says.
DO $$
BEGIN
  IF current_database() NOT LIKE '%demo%' THEN
    RAISE EXCEPTION 'demo-pin: refusing to prune "%", whose name does not contain "demo"', current_database();
  END IF;
END $$;

BEGIN;

CREATE TEMP TABLE demo_pin (at timestamptz NOT NULL) ON COMMIT DROP;
INSERT INTO demo_pin VALUES (:'pin'::timestamptz);

-- One row per table, so the run prints what it deleted.
CREATE TEMP TABLE demo_deleted (table_name text PRIMARY KEY, deleted bigint NOT NULL) ON COMMIT DROP;

-- Content and activity, children before parents. Rows still attached to a deleted row go too.
WITH d AS (DELETE FROM entity_topics WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'entity_topics', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM item_actions WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'item_actions', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

-- A result or update about an item that is about to go cannot outlive it (item_id has no cascade).
WITH d AS (
  DELETE FROM result_versions
  WHERE created_at > (SELECT at FROM demo_pin)
     OR item_id IN (SELECT id FROM items WHERE created_at > (SELECT at FROM demo_pin))
  RETURNING 1
)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'result_versions', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (
  DELETE FROM event_updates
  WHERE created_at > (SELECT at FROM demo_pin)
     OR item_id IN (SELECT id FROM items WHERE created_at > (SELECT at FROM demo_pin))
  RETURNING 1
)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'event_updates', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM submissions WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'submissions', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM lane_checks WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'lane_checks', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM crowd_reports WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'crowd_reports', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM crowd_readings WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'crowd_readings', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

-- Around and Visit are content too: a place or a tip added after the pin was not on the site that night.
WITH d AS (DELETE FROM tips WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'tips', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM tip_sections WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'tip_sections', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

-- A place may have been edited to point at an item that is going; that link cannot stay.
UPDATE places SET item_id = NULL
WHERE item_id IN (SELECT id FROM items WHERE created_at > (SELECT at FROM demo_pin));

WITH d AS (DELETE FROM places WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'places', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

-- A newer topic may have been made the parent of an older one; promote the survivor before deleting.
UPDATE topics SET parent_key = NULL
WHERE parent_key IN (SELECT key FROM topics WHERE created_at > (SELECT at FROM demo_pin));

WITH d AS (DELETE FROM topics WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'topics', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM items WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'items', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM events WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'events', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

-- Posts go after the items they became. A surviving item keeps existing but loses the newer post link.
UPDATE items SET raw_post_id = NULL
WHERE raw_post_id IN (SELECT id FROM raw_posts WHERE created_at > (SELECT at FROM demo_pin));

WITH d AS (DELETE FROM raw_posts WHERE created_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'raw_posts', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

-- Logs and readings carry their own time, not created_at: prune the window after the pin.
WITH d AS (DELETE FROM ingest_runs WHERE started_at > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'ingest_runs', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

WITH d AS (DELETE FROM traffic_readings WHERE bucket_start > (SELECT at FROM demo_pin) RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'traffic_readings', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

-- Every weather snapshot is today's; demo-weather.ts writes the pinned night's back.
WITH d AS (DELETE FROM weather_snapshots RETURNING 1)
INSERT INTO demo_deleted (table_name, deleted) SELECT 'weather_snapshots', count(*) FROM d
ON CONFLICT (table_name) DO UPDATE SET deleted = demo_deleted.deleted + EXCLUDED.deleted;

-- Events still to come at the pin are back to "scheduled", with no live timing.
DO $$
DECLARE reset bigint;
BEGIN
  UPDATE events
  SET status = 'scheduled', actual_start = NULL, actual_end = NULL
  WHERE planned_start > (SELECT at FROM demo_pin) AND status <> 'tba';
  GET DIAGNOSTICS reset = ROW_COUNT;
  RAISE NOTICE 'events reset to scheduled: %', reset;
END $$;

SELECT table_name AS "table", deleted FROM demo_deleted ORDER BY table_name;

COMMIT;
