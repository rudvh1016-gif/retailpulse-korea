ALTER TABLE `airport_congestion` ADD COLUMN `wait_time_raw` text;
--> statement-breakpoint
CREATE TABLE `airport_passenger_forecast` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`terminal` text NOT NULL,
	`direction` text NOT NULL,
	`zone` text NOT NULL,
	`is_aggregate` integer NOT NULL,
	`target_date` text NOT NULL,
	`time_band_raw` text NOT NULL,
	`target_start_at` text NOT NULL,
	`target_end_at` text NOT NULL,
	`expected_passengers` real NOT NULL,
	`retrieved_at` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airport_passenger_forecast_unique` ON `airport_passenger_forecast` (`source_id`,`terminal`,`direction`,`zone`,`target_date`,`time_band_raw`);
--> statement-breakpoint
CREATE INDEX `airport_passenger_forecast_target_idx` ON `airport_passenger_forecast` (`target_date`,`target_start_at`,`terminal`,`direction`);
