CREATE TABLE `airport_congestion` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`terminal` text NOT NULL,
	`zone` text NOT NULL,
	`wait_time_minutes` integer,
	`waiting_count` integer NOT NULL,
	`observed_at` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`freshness` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airport_congestion_observed_unique` ON `airport_congestion` (`source_id`,`terminal`,`zone`,`observed_at`);--> statement-breakpoint
CREATE TABLE `seoul_estimated_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`quarter_code` text NOT NULL,
	`trade_area_code` text NOT NULL,
	`trade_area_name` text,
	`industry_code` text NOT NULL,
	`industry_name` text,
	`sales_amount` integer NOT NULL,
	`sales_count` integer,
	`retrieved_at` text NOT NULL,
	`freshness` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_estimated_sales_unique` ON `seoul_estimated_sales` (`source_id`,`quarter_code`,`trade_area_code`,`industry_code`);--> statement-breakpoint
CREATE TABLE `seoul_realtime_area` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`area_code` text NOT NULL,
	`area_name` text NOT NULL,
	`congestion_level` integer NOT NULL,
	`congestion_label` text NOT NULL,
	`population_min` integer NOT NULL,
	`population_max` integer NOT NULL,
	`observed_at` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`freshness` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_realtime_area_observed_unique` ON `seoul_realtime_area` (`source_id`,`area`,`observed_at`);--> statement-breakpoint
CREATE TABLE `seoul_realtime_forecast` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`area` text NOT NULL,
	`issued_at` text NOT NULL,
	`target_at` text NOT NULL,
	`congestion_level` integer NOT NULL,
	`congestion_label` text NOT NULL,
	`population_min` integer NOT NULL,
	`population_max` integer NOT NULL,
	`retrieved_at` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_realtime_forecast_unique` ON `seoul_realtime_forecast` (`source_id`,`area`,`issued_at`,`target_at`);--> statement-breakpoint
CREATE TABLE `tourism_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`content_id` text NOT NULL,
	`title` text NOT NULL,
	`address` text,
	`lat` text,
	`lng` text,
	`distance_m` integer,
	`event_start` text NOT NULL,
	`event_end` text,
	`published_at` text,
	`retrieved_at` text NOT NULL,
	`freshness` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tourism_events_area_content_unique` ON `tourism_events` (`source_id`,`area`,`content_id`);