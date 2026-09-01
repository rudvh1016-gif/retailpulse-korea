-- Read-path indexes for the public live endpoints.
--
-- Every existing index on these tables leads with `source_id`, but the public
-- queries filter by area / terminal / direction and a time range and never
-- constrain source_id. A leading column the query does not mention makes the
-- index unusable, so each of those queries fully scanned a table that grows
-- every day. On D1 a scanned row is a billed row read, which is how a single
-- uncached /api/live/summary came to read six figures of rows and exhaust the
-- Free daily allowance (Cloudflare error 7500) on 2026-09-01.
--
-- These indexes match the read predicates exactly, in predicate order, so the
-- plans become SEARCH. They cost write amplification on insert, which is small:
-- the collectors write changed rows only, a few hundred per day per table.
CREATE INDEX IF NOT EXISTS `seoul_realtime_area_area_observed_idx` ON `seoul_realtime_area` (`area`,`observed_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `seoul_realtime_forecast_area_issue_idx` ON `seoul_realtime_forecast` (`area`,`issued_at`,`target_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `weather_forecast_area_issue_idx` ON `weather_forecast` (`area`,`issued_at`,`target_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `seoul_estimated_sales_area_quarter_idx` ON `seoul_estimated_sales` (`area`,`quarter_code`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `airport_congestion_terminal_observed_idx` ON `airport_congestion` (`terminal`,`observed_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `airport_flights_direction_scheduled_idx` ON `airport_flights` (`direction`,`scheduled_at`);
--> statement-breakpoint
-- The date-picker probe filters seoul_realtime_area on observed_at alone, so it
-- needs observed_at as the leading column; the (area, observed_at) index above
-- serves the per-area latest lookup instead.
CREATE INDEX IF NOT EXISTS `seoul_realtime_area_observed_idx` ON `seoul_realtime_area` (`observed_at`);
