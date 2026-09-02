-- T1 event detail from the same official provider (KTO TourAPI KorService2).
--
-- searchFestival2 already returns the official category codes (cat1/cat2/cat3),
-- the detailed address and a phone number; the collector kept only the title,
-- addr1, coordinates and dates. Those list fields are now stored at zero extra
-- cost. What the list does NOT carry — the official overview and homepage —
-- comes from detailCommon2, fetched ONCE per new contentId by the daily
-- collector and stored here; the page never calls the provider.
--
-- Category names come from the official categoryCode2 operation and are cached
-- in tourapi_category_codes so a code is looked up once, not once per event.
-- Every column is nullable and additive; nothing is backfilled or rewritten.
ALTER TABLE `tourism_events` ADD `category_code` text;--> statement-breakpoint
ALTER TABLE `tourism_events` ADD `category_group_code` text;--> statement-breakpoint
ALTER TABLE `tourism_events` ADD `category_name` text;--> statement-breakpoint
ALTER TABLE `tourism_events` ADD `address_detail` text;--> statement-breakpoint
ALTER TABLE `tourism_events` ADD `tel` text;--> statement-breakpoint
ALTER TABLE `tourism_events` ADD `overview` text;--> statement-breakpoint
ALTER TABLE `tourism_events` ADD `homepage` text;--> statement-breakpoint
ALTER TABLE `tourism_events` ADD `detail_retrieved_at` text;--> statement-breakpoint
CREATE TABLE `tourapi_category_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`parent_code` text,
	`name` text NOT NULL,
	`retrieved_at` text NOT NULL
);
