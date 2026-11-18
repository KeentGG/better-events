CREATE TYPE "public"."guide_icon" AS ENUM('water', 'cash', 'rain', 'meet', 'map', 'compass', 'help', 'food', 'bus', 'sun', 'phone', 'shield');--> statement-breakpoint
CREATE TABLE "tip_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"icon" "guide_icon" DEFAULT 'compass' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_collector_id" uuid,
	"created_by_staff_id" uuid,
	"updated_by_collector_id" uuid,
	"updated_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"icon" "guide_icon",
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_collector_id" uuid,
	"created_by_staff_id" uuid,
	"updated_by_collector_id" uuid,
	"updated_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tip_sections" ADD CONSTRAINT "tip_sections_created_by_collector_id_collectors_id_fk" FOREIGN KEY ("created_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_sections" ADD CONSTRAINT "tip_sections_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_sections" ADD CONSTRAINT "tip_sections_updated_by_collector_id_collectors_id_fk" FOREIGN KEY ("updated_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_sections" ADD CONSTRAINT "tip_sections_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_section_id_tip_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."tip_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_created_by_collector_id_collectors_id_fk" FOREIGN KEY ("created_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_updated_by_collector_id_collectors_id_fk" FOREIGN KEY ("updated_by_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tip_sections_slug_uq" ON "tip_sections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tips_section_idx" ON "tips" USING btree ("section_id","position");--> statement-breakpoint
-- The visitor guide that used to be written into the site (src/data/guide.ts), so it can be edited on the team desk.
INSERT INTO "tip_sections" ("slug", "title", "icon", "featured", "position") VALUES ('getting-there', 'Getting there', 'map', false, 0);--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'By air', 'Fly into Bacolod–Silay Airport, then take a shuttle or taxi into the city. Allow about 45 minutes.', NULL, 0 FROM "tip_sections" WHERE "slug" = 'getting-there';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'By sea from Iloilo', 'Fast craft ferries cross the Guimaras Strait to Bacolod in about an hour.', NULL, 1 FROM "tip_sections" WHERE "slug" = 'getting-there';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Around the city', 'Jeepneys follow Lacson and Araneta St. Roads near the parade route close on dance days, so walk the last stretch.', NULL, 2 FROM "tip_sections" WHERE "slug" = 'getting-there';--> statement-breakpoint
INSERT INTO "tip_sections" ("slug", "title", "icon", "featured", "position") VALUES ('what-to-do', 'What to do', 'compass', false, 1);--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Watch the street dance', 'Get to Lacson St early for a spot in the shade. The main groups pass mid-afternoon.', NULL, 0 FROM "tip_sections" WHERE "slug" = 'what-to-do';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Make a mask', 'Workshops at the Public Plaza let you paint your own, like the first MassKara in 1980.', NULL, 1 FROM "tip_sections" WHERE "slug" = 'what-to-do';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Eat like a local', 'Chicken inasal at Manokan Country, then piaya and napoleones for pasalubong.', NULL, 2 FROM "tip_sections" WHERE "slug" = 'what-to-do';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Stay for Electric MassKara', 'The night parade lights up Lacson St with LED costumes.', NULL, 3 FROM "tip_sections" WHERE "slug" = 'what-to-do';--> statement-breakpoint
INSERT INTO "tip_sections" ("slug", "title", "icon", "featured", "position") VALUES ('good-to-know', 'Good to know', 'help', false, 2);--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'First aid', 'Medical tents stand along the parade route and at the Public Plaza.', NULL, 0 FROM "tip_sections" WHERE "slug" = 'good-to-know';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Lost and found', 'Ask at the festival information booth near the Government Center.', NULL, 1 FROM "tip_sections" WHERE "slug" = 'good-to-know';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Emergency', 'Dial 911 for police, fire or ambulance anywhere in the Philippines.', NULL, 2 FROM "tip_sections" WHERE "slug" = 'good-to-know';--> statement-breakpoint
INSERT INTO "tip_sections" ("slug", "title", "icon", "featured", "position") VALUES ('tips-and-tricks', 'Tips and tricks', 'sun', true, 3);--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Bring water and a hat', 'Parades run through the midday heat. Refill stations sit near the Plaza.', 'water', 0 FROM "tip_sections" WHERE "slug" = 'tips-and-tricks';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Carry small bills', 'Kiosks and jeepneys rarely have change for 1,000 pesos.', 'cash', 1 FROM "tip_sections" WHERE "slug" = 'tips-and-tricks';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Pack a light poncho', 'October showers come fast. Umbrellas block the view in crowds.', 'rain', 2 FROM "tip_sections" WHERE "slug" = 'tips-and-tricks';--> statement-breakpoint
INSERT INTO "tips" ("section_id", "title", "body", "icon", "position") SELECT "id", 'Pick a meeting spot', 'Signal drops near the parade route. Agree on a landmark first.', 'meet', 3 FROM "tip_sections" WHERE "slug" = 'tips-and-tricks';
