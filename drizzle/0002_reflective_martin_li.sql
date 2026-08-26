CREATE TABLE `airport_flight_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`direction` text NOT NULL,
	`flight_number` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`changed_at` text,
	`terminal` text,
	`gate` text,
	`checkin_counter` text,
	`status` text NOT NULL,
	`semantic_hash` text NOT NULL,
	`observed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airport_flight_changes_semantic_unique` ON `airport_flight_changes` (`source_id`,`flight_number`,`direction`,`scheduled_at`,`semantic_hash`);