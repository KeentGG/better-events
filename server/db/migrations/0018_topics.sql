CREATE TABLE "entity_topics" (
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"topic_key" text NOT NULL,
	"source" text DEFAULT 'desk' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"created_by_collector_id" uuid,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_topics_entity_type_entity_id_topic_key_pk" PRIMARY KEY("entity_type","entity_id","topic_key"),
	CONSTRAINT "entity_topics_type_ck" CHECK ("entity_topics"."entity_type" in ('item', 'event', 'place')),
	CONSTRAINT "entity_topics_source_ck" CHECK ("entity_topics"."source" in ('desk', 'classifier'))
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"key" text PRIMARY KEY NOT NULL,
	"parent_key" text,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"icon" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_collector_id" uuid,
	"created_by_staff_id" uuid,
	"updated_by_collector_id" uuid,
	"updated_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_topics" ADD CONSTRAINT "entity_topics_topic_key_topics_key_fk" FOREIGN KEY ("topic_key") REFERENCES "public"."topics"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_topics" ADD CONSTRAINT "entity_topics_created_by_collector_id_collectors_id_fk" FOREIGN KEY ("created_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_topics" ADD CONSTRAINT "entity_topics_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_key_topics_key_fk" FOREIGN KEY ("parent_key") REFERENCES "public"."topics"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_collector_id_collectors_id_fk" FOREIGN KEY ("created_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_updated_by_collector_id_collectors_id_fk" FOREIGN KEY ("updated_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_topics_topic_idx" ON "entity_topics" USING btree ("topic_key");--> statement-breakpoint
CREATE INDEX "topics_parent_idx" ON "topics" USING btree ("parent_key");--> statement-breakpoint
-- At most two levels: a topic's parent must be a root, and a topic with children cannot get a parent.
CREATE FUNCTION "topics_depth_check"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."parent_key" IS NOT NULL THEN
		IF NEW."parent_key" = NEW."key" OR EXISTS (SELECT 1 FROM "topics" WHERE "key" = NEW."parent_key" AND "parent_key" IS NOT NULL) THEN
			RAISE EXCEPTION 'topic % would be more than two levels deep', NEW."key" USING ERRCODE = 'check_violation';
		END IF;
		IF EXISTS (SELECT 1 FROM "topics" WHERE "parent_key" = NEW."key") THEN
			RAISE EXCEPTION 'topic % has children, so it cannot have a parent', NEW."key" USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "topics_depth_check" BEFORE INSERT OR UPDATE OF "parent_key" ON "topics" FOR EACH ROW EXECUTE FUNCTION "topics_depth_check"();
--> statement-breakpoint
-- entity_topics points at items, events and places without a foreign key, so their deletes clean it up.
CREATE FUNCTION "entity_topics_cleanup"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	DELETE FROM "entity_topics" WHERE "entity_type" = TG_ARGV[0] AND "entity_id" = OLD."id";
	RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER "items_entity_topics_cleanup" AFTER DELETE ON "items" FOR EACH ROW EXECUTE FUNCTION "entity_topics_cleanup"('item');--> statement-breakpoint
CREATE TRIGGER "events_entity_topics_cleanup" AFTER DELETE ON "events" FOR EACH ROW EXECUTE FUNCTION "entity_topics_cleanup"('event');--> statement-breakpoint
CREATE TRIGGER "places_entity_topics_cleanup" AFTER DELETE ON "places" FOR EACH ROW EXECUTE FUNCTION "entity_topics_cleanup"('place');
--> statement-breakpoint
-- Seeded from the event kinds and the non-service place kinds, plus Sports, Games and Raffles.
INSERT INTO "topics" ("key", "parent_key", "name", "aliases", "icon", "order") VALUES
	('parades', NULL, 'Parades', '{"parade","street dance","electric masskara"}', 'flag', 10),
	('competitions', NULL, 'Competitions', '{"competition","contest","arena"}', 'trophy', 20),
	('music', NULL, 'Music', '{"concert","band","gig","live music"}', 'music', 30),
	('food', NULL, 'Food', '{"eatery","food stall","restaurant","kaon"}', 'utensils', 40),
	('workshops', NULL, 'Workshops', '{"workshop","class","mask-making"}', 'palette', 50),
	('ceremonies', NULL, 'Ceremonies', '{"ceremony","awarding","opening"}', 'landmark', 60),
	('rides', NULL, 'Rides', '{"ride","carnival","perya","amusement"}', 'ferris-wheel', 70),
	('thrift', NULL, 'Thrift', '{"ukay","ukay-ukay","bazaar","tiangge"}', 'shirt', 80),
	('promos', NULL, 'Promos', '{"promo","deal","sale","discount"}', 'tag', 90),
	('sports', NULL, 'Sports', '{"sport","sports fest"}', 'medal', 100),
	('games', NULL, 'Games', '{"game","sponsor game","palaro"}', 'gamepad-2', 110),
	('raffles', NULL, 'Raffles', '{"raffle","draw","giveaway"}', 'ticket', 120);
--> statement-breakpoint
INSERT INTO "topics" ("key", "parent_key", "name", "aliases", "icon", "order") VALUES
	('sports.chess', 'sports', 'Chess', '{"chess","ahedres"}', 'crown', 10);
--> statement-breakpoint
INSERT INTO "entity_topics" ("entity_type", "entity_id", "topic_key", "source")
SELECT 'event', "id", CASE "kind" WHEN 'parade' THEN 'parades' WHEN 'competition' THEN 'competitions' WHEN 'concert' THEN 'music'
	WHEN 'food' THEN 'food' WHEN 'workshop' THEN 'workshops' WHEN 'ceremony' THEN 'ceremonies' END, 'desk'
FROM "events" WHERE "kind" IN ('parade', 'competition', 'concert', 'food', 'workshop', 'ceremony');
--> statement-breakpoint
INSERT INTO "entity_topics" ("entity_type", "entity_id", "topic_key", "source")
SELECT 'place', "id", CASE "kind" WHEN 'food' THEN 'food' WHEN 'ride' THEN 'rides' WHEN 'thrift' THEN 'thrift' WHEN 'promo' THEN 'promos' END, 'desk'
FROM "places" WHERE "kind" IN ('food', 'ride', 'thrift', 'promo');
--> statement-breakpoint
INSERT INTO "entity_topics" ("entity_type", "entity_id", "topic_key", "source")
SELECT 'item', "id", CASE "category" WHEN 'sponsor_game' THEN 'games' WHEN 'raffle' THEN 'raffles' END, 'desk'
FROM "items" WHERE "category" IN ('sponsor_game', 'raffle');
--> statement-breakpoint
-- What each entity is about, as the API reads it: its own topics, and for an item also those of the
-- event it reported on (event_updates.item_id) and the place it is about (items.place_id).
CREATE VIEW "entity_effective_topics" AS
SELECT "entity_type", "entity_id", "topic_key" FROM "entity_topics"
UNION
SELECT 'item', eu."item_id", et."topic_key" FROM "event_updates" eu
	JOIN "entity_topics" et ON et."entity_type" = 'event' AND et."entity_id" = eu."event_id"
	WHERE eu."item_id" IS NOT NULL
UNION
SELECT 'item', i."id", et."topic_key" FROM "items" i
	JOIN "entity_topics" et ON et."entity_type" = 'place' AND et."entity_id" = i."place_id";
