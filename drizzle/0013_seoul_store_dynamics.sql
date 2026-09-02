CREATE TABLE `seoul_store_dynamics` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`dataset_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`quarter_code` text NOT NULL,
	`trade_area_code` text NOT NULL,
	`trade_area_name` text NOT NULL,
	`trade_area_type_code` text NOT NULL,
	`trade_area_type_name` text NOT NULL,
	`overall_store_count` integer NOT NULL,
	`ordinary_store_count` integer NOT NULL,
	`franchise_store_count` integer NOT NULL,
	`opening_store_count` integer NOT NULL,
	`opening_rate_tenths_percent` integer NOT NULL,
	`closure_store_count` integer NOT NULL,
	`closure_rate_tenths_percent` integer NOT NULL,
	`industry_count` integer NOT NULL,
	`mapping_version` text NOT NULL,
	`source_updated_at` text,
	`retrieved_at` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_store_dynamics_unique` ON `seoul_store_dynamics` (`source_id`,`mapping_version`,`area`,`quarter_code`);
--> statement-breakpoint
CREATE INDEX `seoul_store_dynamics_area_quarter_idx` ON `seoul_store_dynamics` (`area`,`quarter_code` DESC);
