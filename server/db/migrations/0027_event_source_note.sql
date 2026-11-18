ALTER TABLE "events" ADD COLUMN "source_note" text;--> statement-breakpoint
-- Notes on events that were never changed are sourcing, not change lines; delayed, cancelled, moved or extended events keep their public note.
UPDATE "events" SET "source_note" = "note", "note" = NULL WHERE "note" IS NOT NULL AND "status" = 'scheduled' AND "original_start" IS NULL;
