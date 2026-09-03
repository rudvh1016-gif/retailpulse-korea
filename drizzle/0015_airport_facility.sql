-- Airport Retail A2: official passenger-terminal facility directory
-- (인천국제공항공사_여객터미널 시설정보 현황, data.go.kr 15095064).
--
-- One row per official facility (the provider's `sn`), with the four
-- official language names side by side. Slow-changing reference data:
-- changed-only upserts keyed by facility_id, never deleted by a collector.
-- Additive only.
CREATE TABLE `airport_facility` (
  `facility_id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `name_ko` text,
  `name_en` text,
  `name_zh` text,
  `name_ja` text,
  `facility_item` text,
  `large_category` text,
  `medium_category` text,
  `small_category` text,
  `category_group` text NOT NULL,
  `terminal_code` text,
  `terminal` text,
  `floor` text,
  `duty_area` text,
  `arrival_departure` text,
  `location_raw` text,
  `location_en` text,
  `business_hours_raw` text,
  `goods_brands` text,
  `phone` text,
  `retrieved_at` text NOT NULL,
  `schema_version` text NOT NULL,
  `quality_status` text NOT NULL,
  `source_hash` text NOT NULL
);
--> statement-breakpoint
-- The directory is browsed by terminal and/or category and listed by name,
-- so both leading orders exist and each covers the ORDER BY. Floor, area and
-- arrival/departure are low-cardinality filters that always ride along inside
-- one of these seeks; they never lead a query and so need no index of their own.
CREATE INDEX `airport_facility_terminal_category_idx` ON `airport_facility` (`terminal`,`category_group`,`name_ko`);
--> statement-breakpoint
CREATE INDEX `airport_facility_category_terminal_idx` ON `airport_facility` (`category_group`,`terminal`,`name_ko`);
