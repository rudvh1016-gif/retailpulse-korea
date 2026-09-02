-- W1 weather enrichment: read more of the response KMA already sends.
--
-- `getVilageFcst` returns every category in one response. The collector kept
-- POP, TMP, SKY and PTY and discarded the rest, so humidity, wind, amounts and
-- the daily extremes were paid for and thrown away. Reading them costs no
-- extra provider request; the grids, the schedule and the request count are
-- untouched by this migration.
--
-- Every column is nullable and additive. Rows written before this migration
-- stay valid with NULLs, and nothing is backfilled: the weather insert is
-- ON CONFLICT DO NOTHING, so a past forecast is never rewritten to look richer
-- than it was recorded. New scheduled issuances populate the fields naturally.
--
-- PCP and SNO are documented as 정성정보 — qualitative values — and arrive as
-- strings such as `강수없음` or `1.0mm 미만`. The provider's own string is kept
-- verbatim in the `_raw` column and is the audit record. The `_kind` column
-- names which shape it was, and the tenths column holds a number ONLY when the
-- provider gave an exact one. `1.0mm 미만` therefore stores its raw text and a
-- NULL amount, because a bound is not a measurement.

ALTER TABLE `weather_forecast` ADD `humidity_percent` integer;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `wind_speed_tenth_mps` integer;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `daily_min_temperature_tenth_c` integer;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `daily_max_temperature_tenth_c` integer;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `precipitation_amount_raw` text;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `precipitation_amount_kind` text;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `precipitation_amount_tenth_mm` integer;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `snow_amount_raw` text;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `snow_amount_kind` text;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `snow_amount_tenth_cm` integer;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `sky_code` text;--> statement-breakpoint
ALTER TABLE `weather_forecast` ADD `precipitation_type_code` text;
