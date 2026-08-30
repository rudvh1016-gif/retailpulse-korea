ALTER TABLE `airport_flights` ADD COLUMN `physical_flight_id` text;
--> statement-breakpoint
ALTER TABLE `airport_flights` ADD COLUMN `upstream_fid` text;
--> statement-breakpoint
ALTER TABLE `airport_flights` ADD COLUMN `master_flight_number` text;
--> statement-breakpoint
ALTER TABLE `airport_flights` ADD COLUMN `codeshare` text;
--> statement-breakpoint
ALTER TABLE `airport_flights` ADD COLUMN `a2_source_hash` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `airport_flights_physical_unique` ON `airport_flights` (`physical_flight_id`);
--> statement-breakpoint
CREATE TABLE `airport_scheduled_flights` (
  `physical_schedule_id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `upstream_fid` text,
  `season` text NOT NULL,
  `valid_from` text NOT NULL,
  `valid_to` text NOT NULL,
  `weekdays` text NOT NULL,
  `flight_number` text NOT NULL,
  `master_flight_number` text,
  `codeshare` text,
  `airline` text,
  `airline_code` text,
  `airport` text,
  `airport_code` text,
  `terminal` text,
  `scheduled_time` text NOT NULL,
  `retrieved_at` text NOT NULL,
  `schema_version` text NOT NULL,
  `quality_status` text NOT NULL,
  `source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `airport_scheduled_window_idx` ON `airport_scheduled_flights` (`valid_from`,`valid_to`,`terminal`,`scheduled_time`);
