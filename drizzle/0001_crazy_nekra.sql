CREATE TABLE `airport_flights` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`direction` text NOT NULL,
	`flight_number` text NOT NULL,
	`airline_code` text,
	`airport_code` text,
	`terminal` text,
	`gate` text,
	`checkin_counter` text,
	`status` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`changed_at` text,
	`event_at` text NOT NULL,
	`published_at` text,
	`retrieved_at` text NOT NULL,
	`freshness` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airport_flights_source_event_unique` ON `airport_flights` (`source_id`,`flight_number`,`direction`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `airport_flow` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`terminal` text,
	`direction` text NOT NULL,
	`event_at` text NOT NULL,
	`published_at` text,
	`retrieved_at` text NOT NULL,
	`value` integer NOT NULL,
	`unit` text NOT NULL,
	`freshness` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airport_flow_source_event_unique` ON `airport_flow` (`source_id`,`terminal`,`direction`,`event_at`);--> statement-breakpoint
CREATE TABLE `baseline_predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`prediction_id` text NOT NULL,
	`baseline_id` text NOT NULL,
	`value` integer NOT NULL,
	`value_scale` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_prediction_unique` ON `baseline_predictions` (`prediction_id`,`baseline_id`);--> statement-breakpoint
CREATE TABLE `collector_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`records_read` integer DEFAULT 0 NOT NULL,
	`records_written` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`detail` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collector_source_start_unique` ON `collector_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `foreign_presence` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`event_at` text NOT NULL,
	`available_at` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`value` integer NOT NULL,
	`unit` text NOT NULL,
	`freshness` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foreign_presence_area_event_unique` ON `foreign_presence` (`source_id`,`area`,`event_at`);--> statement-breakpoint
CREATE TABLE `model_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`model_version` text NOT NULL,
	`proxy_version` text NOT NULL,
	`feature_version` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_target_version_unique` ON `model_versions` (`target_id`,`model_version`);--> statement-breakpoint
CREATE TABLE `outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`prediction_id` text NOT NULL,
	`target_id` text NOT NULL,
	`event_at` text NOT NULL,
	`available_at` text NOT NULL,
	`collected_at` text NOT NULL,
	`actual_value` integer NOT NULL,
	`actual_unit` text NOT NULL,
	`source_id` text NOT NULL,
	`source_version` text NOT NULL,
	`verification_level` text NOT NULL,
	`quality_status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outcome_prediction_source_unique` ON `outcomes` (`prediction_id`,`source_id`,`verification_level`);--> statement-breakpoint
CREATE TABLE `predictions` (
	`prediction_id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`target_at` text NOT NULL,
	`data_cutoff` text NOT NULL,
	`target_id` text NOT NULL,
	`area` text NOT NULL,
	`industry` text,
	`value` integer NOT NULL,
	`value_scale` integer DEFAULT 1 NOT NULL,
	`forecast_class` text NOT NULL,
	`confidence` text NOT NULL,
	`model_version` text NOT NULL,
	`proxy_version` text NOT NULL,
	`feature_version` text NOT NULL,
	`source_versions` text NOT NULL,
	`input_hash` text NOT NULL,
	`prediction_hash` text NOT NULL,
	`record_origin` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `predictions_hash_unique` ON `predictions` (`prediction_hash`);--> statement-breakpoint
CREATE TABLE `source_health` (
	`source_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`last_event_at` text,
	`last_published_at` text,
	`last_retrieved_at` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`schema_version` text NOT NULL,
	`detail` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weather_actual` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`area` text NOT NULL,
	`event_at` text NOT NULL,
	`available_at` text NOT NULL,
	`collected_at` text NOT NULL,
	`precipitation_tenth_mm` integer,
	`temperature_tenth_c` integer,
	`condition_code` text,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weather_actual_area_event_unique` ON `weather_actual` (`source_id`,`area`,`event_at`);--> statement-breakpoint
CREATE TABLE `weather_forecast` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`area` text NOT NULL,
	`issued_at` text NOT NULL,
	`target_at` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`precipitation_probability` integer,
	`temperature_tenth_c` integer,
	`condition_code` text,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weather_forecast_issue_target_unique` ON `weather_forecast` (`source_id`,`area`,`issued_at`,`target_at`);
--> statement-breakpoint
CREATE TRIGGER `predictions_prevent_update`
BEFORE UPDATE ON `predictions`
BEGIN
	SELECT RAISE(ABORT, 'predictions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `predictions_prevent_delete`
BEFORE DELETE ON `predictions`
BEGIN
	SELECT RAISE(ABORT, 'predictions are immutable');
END;
