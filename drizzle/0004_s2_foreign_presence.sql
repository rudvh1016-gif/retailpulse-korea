CREATE TABLE `seoul_foreign_presence_area` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`product_version` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`reference_at` text NOT NULL,
	`available_at` text,
	`retrieved_at` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`administrative_dong_codes_json` text NOT NULL,
	`mapping_version` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_foreign_presence_area_unique` ON `seoul_foreign_presence_area` (`source_id`,`product_version`,`mapping_version`,`area`,`reference_at`);--> statement-breakpoint
CREATE TABLE `seoul_foreign_presence_dong` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`product_version` text NOT NULL,
	`record_origin` text NOT NULL,
	`administrative_dong_code` text NOT NULL,
	`reference_at` text NOT NULL,
	`available_at` text,
	`retrieved_at` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`nationality_json` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_foreign_presence_dong_unique` ON `seoul_foreign_presence_dong` (`source_id`,`product_version`,`administrative_dong_code`,`reference_at`);
