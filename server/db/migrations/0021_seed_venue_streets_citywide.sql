INSERT INTO "place_kinds" ("key", "name", "plural", "icon", "services", "aliases") VALUES
	('venue', 'Venue', 'Festival venues', 'pin', false, '{"hub","stage","grounds","arena"}')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "areas" ("name", "aliases") VALUES
	('Citywide', '{"Bacolod","Bacolod City","city-wide","whole city"}'),
	('Rizal St', '{"Rizal Street"}'),
	('Gonzaga St', '{"Gonzaga Street"}'),
	('San Juan St', '{"San Juan Street"}'),
	('Gatuslao St', '{"Gatuslao Street"}')
ON CONFLICT ("name") DO NOTHING;
