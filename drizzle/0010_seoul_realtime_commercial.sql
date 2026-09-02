-- OA-21285 realtime commercial activity from the integrated citydata response.
-- Values are Shinhan Card domestic-consumer activity, not total or foreign
-- sales. Nullable payment fields preserve provider suppression as unknown.
CREATE TABLE `seoul_realtime_commercial` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`record_origin` text NOT NULL,
	`area` text NOT NULL,
	`area_code` text NOT NULL,
	`area_name` text NOT NULL,
	`commercial_level` text NOT NULL,
	`payment_count` integer,
	`payment_amount_min` integer,
	`payment_amount_max` integer,
	`observed_at` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`freshness` text NOT NULL,
	`schema_version` text NOT NULL,
	`quality_status` text NOT NULL,
	`source_hash` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `seoul_realtime_commercial_unique` ON `seoul_realtime_commercial` (`source_id`,`area`,`observed_at`);--> statement-breakpoint
CREATE INDEX `seoul_realtime_commercial_area_observed_idx` ON `seoul_realtime_commercial` (`area`,`observed_at`);
