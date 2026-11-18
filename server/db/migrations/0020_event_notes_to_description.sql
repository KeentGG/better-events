-- Events had no description field, so the desk's note held what an event is. Changes (a delay, a venue)
-- replace the note, so move those descriptions out of its way. Notes written by a change stay put.
UPDATE "events" SET "description" = "note", "note" = NULL
WHERE "description" IS NULL AND "note" IS NOT NULL AND "status" = 'scheduled'
	AND "note" NOT LIKE 'Moved from %' AND "note" NOT IN ('Time to follow', 'Cancelled');
