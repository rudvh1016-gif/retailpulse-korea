-- Month-to-date read budget, measured not assumed.
--
-- Production D1, 2026-09-14: summing this month and the previous month's same
-- span cost ~259 rows READ per service date and took one uncached
-- /api/live/summary from 3,269 to ~10,000 rows. The existing
-- `airport_passenger_forecast_target_idx` starts at `target_date`, so a seek
-- lands on the date and then has to walk every row of it — both directions,
-- aggregate and component alike — to apply the filter. Rewriting the range as
-- `target_date IN (...)` changed nothing, because the cost is the walk, not
-- the seek.
--
-- This index leads with the two equality columns the query fixes
-- (`direction`, `is_aggregate`), so the seek lands directly on the departure
-- aggregate rows of each date. It then carries `target_date`, `terminal`,
-- `target_start_at`, `target_end_at` and `expected_passengers`, which is
-- everything the month query selects and orders by — so SQLite can answer it
-- from the index alone, with no table lookup and no temporary sort.
--
-- Additive and reversible: no column, table or row is changed, and the daily
-- path keeps using the existing index. The write cost is one index entry per
-- forecast row actually changed, which the changed-only collector keeps at
-- roughly the low tens per day.
CREATE INDEX IF NOT EXISTS `airport_passenger_forecast_month_idx`
  ON `airport_passenger_forecast` (
    `direction`, `is_aggregate`, `target_date`, `terminal`,
    `target_start_at`, `target_end_at`, `expected_passengers`
  );
