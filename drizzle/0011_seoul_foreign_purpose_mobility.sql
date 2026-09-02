CREATE TABLE `seoul_foreign_purpose_mobility` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`dataset_id` text NOT NULL,
	`publication_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`reference_date` text NOT NULL,
	`purpose` text NOT NULL,
	`movement_value` real NOT NULL,
	`unit` text NOT NULL,
	`destination_codes_json` text NOT NULL,
	`mapping_version` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_foreign_purpose_mobility_unique` ON `seoul_foreign_purpose_mobility` (`source_id`,`mapping_version`,`area`,`reference_date`,`purpose`);
--> statement-breakpoint
CREATE INDEX `seoul_foreign_purpose_mobility_area_reference_idx` ON `seoul_foreign_purpose_mobility` (`area`,`reference_date`,`purpose`);
--> statement-breakpoint
CREATE INDEX `seoul_foreign_purpose_mobility_publication_idx` ON `seoul_foreign_purpose_mobility` (`source_id`,`dataset_id`,`publication_id`);
--> statement-breakpoint
CREATE TABLE `seoul_foreign_purpose_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`dataset_id` text NOT NULL,
	`publication_id` text NOT NULL,
	`file_name` text NOT NULL,
	`reference_date` text NOT NULL,
	`aggregate_rows` integer NOT NULL,
	`source_rows_read` integer NOT NULL,
	`retrieved_at` text NOT NULL,
	`schema_version` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_foreign_purpose_publications_unique` ON `seoul_foreign_purpose_publications` (`source_id`,`dataset_id`,`publication_id`);
