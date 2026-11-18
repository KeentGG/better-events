-- Topics, rewritten as the things a visitor says they are into. The first list mirrored the event kinds
-- (Competitions, Ceremonies), which say how an event is run, not what it is about. Keys that exist stay,
-- since visitors' saved interests name them.
UPDATE "topics" SET "name" = 'Street dance & parades', "aliases" = '{"parade","street dance","streetdance","electric masskara","arena","float"}', "order" = 20 WHERE "key" = 'parades';--> statement-breakpoint
UPDATE "topics" SET "aliases" = '{"music","live music"}', "order" = 30 WHERE "key" = 'music';--> statement-breakpoint
UPDATE "topics" SET "aliases" = '{"sport","sports fest","tournament"}', "order" = 80 WHERE "key" = 'sports';--> statement-breakpoint
UPDATE "topics" SET "aliases" = '{"kaon","eat"}', "order" = 90 WHERE "key" = 'food';--> statement-breakpoint
UPDATE "topics" SET "name" = 'Workshops & talks', "aliases" = '{"workshop","class","bootcamp","hackathon","seminar","talk"}', "icon" = 'graduation-cap', "order" = 120 WHERE "key" = 'workshops';--> statement-breakpoint
UPDATE "topics" SET "name" = 'Games & quests', "aliases" = '{"game","sponsor game","palaro","quest","esports"}', "order" = 130 WHERE "key" = 'games';--> statement-breakpoint
UPDATE "topics" SET "name" = 'Raffles & prizes', "order" = 140 WHERE "key" = 'raffles';--> statement-breakpoint
UPDATE "topics" SET "name" = 'Promos & deals', "aliases" = '{"promo","deal","sale","discount","freebie"}', "order" = 150 WHERE "key" = 'promos';--> statement-breakpoint
UPDATE "topics" SET "name" = 'Thrift & bazaars', "order" = 160 WHERE "key" = 'thrift';--> statement-breakpoint
UPDATE "topics" SET "name" = 'Rides & carnival', "order" = 170 WHERE "key" = 'rides';--> statement-breakpoint
-- How an event is run, not an interest: kept for old rows, no longer offered.
UPDATE "topics" SET "hidden" = true WHERE "key" IN ('competitions', 'ceremonies');--> statement-breakpoint
INSERT INTO "topics" ("key", "parent_key", "name", "aliases", "icon", "order") VALUES
	('highlights', NULL, 'Festival highlights', '{"highlight","main event","grand opening","closing"}', 'sparkles', 10),
	('dance', NULL, 'Dance', '{"dance","sayaw","zumba","bachata","salsa","choreography"}', 'footprints', 40),
	('pageants', NULL, 'Pageants', '{"pageant","coronation","masskareyna","miss bacolod","queen"}', 'crown', 50),
	('shows', NULL, 'Celebrities & shows', '{"celebrity","meet and greet","fancon","mall show","drag"}', 'star', 60),
	('art', NULL, 'Art, masks & costumes', '{"art","mask","mask-making","costume","painting","puppet","mural"}', 'palette', 70),
	('family', NULL, 'Kids & family', '{"kids","children","family"}', 'baby', 100),
	('community', NULL, 'Community & services', '{"job fair","medical mission","legal clinic","pwd","sector"}', 'heart-handshake', 110)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "topics" ("key", "parent_key", "name", "aliases", "icon", "order") VALUES
	('music.concerts', 'music', 'Concerts & live bands', '{"concert","band","gig","music fest"}', 'mic-vocal', 10),
	('music.parties', 'music', 'Parties & DJs', '{"party","dj","club","rave","pre-party","block party"}', 'disc-3', 20),
	('music.rap', 'music', 'Rap & hip-hop', '{"rap","rap battle","hip-hop","hiphop","fliptop"}', 'audio-lines', 30),
	('music.singing', 'music', 'Singing contests', '{"singing","singkara","karaoke","videoke"}', 'mic', 40),
	('music.drums', 'music', 'Drums & marching bands', '{"drum","drum and lyre","drumline","drum beating"}', 'drum', 50),
	('sports.running', 'sports', 'Runs & multisport', '{"run","fun run","duathlon","triathlon","marathon","cycling"}', 'timer', 20),
	('sports.pickleball', 'sports', 'Pickleball', '{"pickleball"}', 'medal', 30),
	('sports.skate', 'sports', 'Skate & BMX', '{"skate","skateboard","bmx"}', 'bike', 40),
	('sports.team', 'sports', 'Team sports', '{"frisbee","tchoukball","basketball","volleyball","football"}', 'users', 50),
	('food.parks', 'food', 'Food parks & stalls', '{"food park","food stall","food kiosk","foodfest","eatery","restaurant"}', 'store', 10),
	('food.markets', 'food', 'Markets & trade fairs', '{"market","market day","trade fair","pasalubong"}', 'shopping-basket', 20),
	('family.pets', 'family', 'Pets', '{"pet","pets","dog","petskara"}', 'paw-print', 10)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Retag the schedule by title. An event that matches any rule gets exactly the rules' topics; one that
-- matches none keeps what the desk gave it.
CREATE TEMP TABLE "topic_rules" ("pattern" text, "topic_key" text);--> statement-breakpoint
INSERT INTO "topic_rules" VALUES
	('electric masskara', 'highlights'), ('electric masskara', 'parades'), ('electric masskara', 'dance'),
	('streetdance and arena', 'highlights'), ('streetdance and arena', 'parades'), ('streetdance and arena', 'dance'),
	('parade of champions', 'highlights'), ('parade of champions', 'parades'), ('parade of champions', 'music.parties'),
	('lacson tourism strip', 'highlights'), ('lacson tourism strip', 'food.parks'), ('lacson tourism strip', 'music.parties'),
	('coronation night', 'highlights'), ('coke studio', 'highlights'),
	('masskareyna|miss bacolod|^mbm |teen masskara', 'pageants'),
	('costume|mask painting|paint tomorrow|mega puppets|pedestrian art|creative bacolod', 'art'),
	('mask painting', 'workshops'), ('hackathon', 'workshops'),
	('choreographers|hataw sayaw|zumdigras|latinegros|gaynon dance', 'dance'),
	('singkara', 'music.singing'),
	('drum', 'music.drums'),
	('masskarap|kareppin|karepin|rap battle|curse one', 'music.rap'),
	('battle of the bands|6ense at masskara|karavan|casino plus|bachata concert|curse one|coke studio|ginuman|music fest|dishwalla|lyve fest|winfest|fancon|\mrap battle', 'music.concerts'),
	('acacia fun street|barqva|blackout|housekara|la jefa|hazed|massqueeradya|millennials|rebelz|80s party|msskra|latinegros (afro|pre)', 'music.parties'),
	('mommy guard|celebrity show|karavan|mall show|fancon|massqueeradya', 'shows'),
	('acacia fun street|foodfest|food kiosk', 'food.parks'),
	('market day', 'food.markets'),
	('duathlon|leg run', 'sports.running'), ('pickleball', 'sports.pickleball'), ('skate', 'sports.skate'), ('tchoukball|frisbee', 'sports.team'),
	('kidskara', 'family'), ('kidskara', 'games'), ('petskara', 'family.pets'),
	('masskara quest|league of champions', 'games'),
	('job fair|legal clinic|medical mission|convergence day|pwd day|toda day|bidang sektor|media night', 'community');--> statement-breakpoint
DELETE FROM "entity_topics" et USING "events" e
WHERE et."entity_type" = 'event' AND et."entity_id" = e."id"
	AND EXISTS (SELECT 1 FROM "topic_rules" r WHERE e."title" ~* r."pattern");--> statement-breakpoint
INSERT INTO "entity_topics" ("entity_type", "entity_id", "topic_key", "source")
SELECT DISTINCT 'event', e."id", r."topic_key", 'desk' FROM "events" e JOIN "topic_rules" r ON e."title" ~* r."pattern"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Food spots sit under Food parks & stalls; a venue is tagged with what it is known for.
UPDATE "entity_topics" et SET "topic_key" = 'food.parks' FROM "places" p
WHERE et."entity_type" = 'place' AND et."entity_id" = p."id" AND et."topic_key" = 'food'
	AND NOT EXISTS (SELECT 1 FROM "entity_topics" x WHERE x."entity_type" = 'place' AND x."entity_id" = p."id" AND x."topic_key" = 'food.parks');--> statement-breakpoint
UPDATE "entity_topics" et SET "topic_key" = 'highlights' FROM "places" p
WHERE et."entity_type" = 'place' AND et."entity_id" = p."id" AND et."topic_key" = 'competitions' AND p."kind" = 'venue'
	AND NOT EXISTS (SELECT 1 FROM "entity_topics" x WHERE x."entity_type" = 'place' AND x."entity_id" = p."id" AND x."topic_key" = 'highlights');--> statement-breakpoint
-- Posts keep the retired tags only when they have nothing else to be found by.
DELETE FROM "entity_topics" et
WHERE et."topic_key" IN ('competitions', 'ceremonies') AND et."entity_type" = 'item'
	AND EXISTS (SELECT 1 FROM "entity_effective_topics" x WHERE x."entity_type" = 'item' AND x."entity_id" = et."entity_id" AND x."topic_key" NOT IN ('competitions', 'ceremonies'));--> statement-breakpoint
DROP TABLE "topic_rules";
