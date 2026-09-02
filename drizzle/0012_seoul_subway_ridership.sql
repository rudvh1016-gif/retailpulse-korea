CREATE TABLE `seoul_subway_ridership` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`dataset_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`reference_date` text NOT NULL,
	`station_code` text NOT NULL,
	`station_number` text NOT NULL,
	`station_name` text NOT NULL,
	`line_name` text NOT NULL,
	`boarding_count` integer NOT NULL,
	`alighting_count` integer NOT NULL,
	`mapping_version` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_subway_ridership_unique` ON `seoul_subway_ridership` (`source_id`,`mapping_version`,`area`,`reference_date`,`station_code`);
--> statement-breakpoint
CREATE INDEX `seoul_subway_ridership_area_reference_idx` ON `seoul_subway_ridership` (`area`,`mapping_version`,`reference_date`,`station_code`);
--> statement-breakpoint
CREATE TABLE `seoul_subway_collection_checkpoint` (
	`source_id` text PRIMARY KEY NOT NULL,
	`last_checked_kst_date` text NOT NULL,
	`latest_reference_date` text,
	`retrieved_at` text NOT NULL,
	`schema_version` text NOT NULL
);
