CREATE TYPE "public"."place_icon" AS ENUM('promo', 'ride', 'thrift', 'food', 'kiosk', 'restroom', 'first_aid', 'police', 'atm', 'pin');--> statement-breakpoint
CREATE TABLE "place_kinds" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plural" text NOT NULL,
	"icon" "place_icon" DEFAULT 'pin' NOT NULL,
	"services" boolean DEFAULT false NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_collector_id" uuid,
	"created_by_staff_id" uuid,
	"updated_by_collector_id" uuid,
	"updated_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_kinds_name_unique" UNIQUE("name")
);
--> statement-breakpoint
-- The festival spots Around already had, plus the services people look for near the route.
INSERT INTO "place_kinds" ("key", "name", "plural", "icon", "services", "aliases") VALUES
	('promo', 'Promo', 'Promos', 'promo', false, '{"deal","sale","discount"}'),
	('ride', 'Ride', 'Carnival rides', 'ride', false, '{"carnival","perya","amusement"}'),
	('thrift', 'Thrift', 'Thrift and bazaars', 'thrift', false, '{"ukay","ukay-ukay","bazaar","tiangge"}'),
	('food', 'Food', 'Food', 'food', false, '{"eatery","food stall","restaurant","kaon"}'),
	('kiosk', 'Kiosk', 'Kiosks', 'kiosk', false, '{"booth","stall","souvenir"}'),
	('restroom', 'Restroom', 'Restrooms', 'restroom', true, '{"CR","comfort room","toilet","washroom","banyo"}'),
	('first_aid', 'First aid', 'First aid stations', 'first_aid', true, '{"medic","medical","clinic","red cross","ambulance"}'),
	('police', 'Police desk', 'Police desks', 'police', true, '{"police","pulis","PNP","BCPO","police assistance","tanod"}'),
	('atm', 'ATM', 'ATMs', 'atm', true, '{"bank","cash","money"}');
--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "kind" SET DATA TYPE text USING "kind"::text;--> statement-breakpoint
ALTER TABLE "place_kinds" ADD CONSTRAINT "place_kinds_created_by_collector_id_collectors_id_fk" FOREIGN KEY ("created_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_kinds" ADD CONSTRAINT "place_kinds_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_kinds" ADD CONSTRAINT "place_kinds_updated_by_collector_id_collectors_id_fk" FOREIGN KEY ("updated_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_kinds" ADD CONSTRAINT "place_kinds_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_kind_place_kinds_key_fk" FOREIGN KEY ("kind") REFERENCES "public"."place_kinds"("key") ON DELETE no action ON UPDATE no action;