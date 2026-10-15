-- 15095071 / 15095070 인천국제공항공사 monthly passenger statistics.
-- One compact row per operation and month (official results, airport-wide).
-- Written by the daily Actions collector only when the provider's rows change.
CREATE TABLE IF NOT EXISTS airport_monthly_stats (
 operation_id TEXT NOT NULL CHECK(operation_id IN ('ROUTE_COUNTRY_PASSENGERS','TIME_BAND_PASSENGERS')),
 month TEXT NOT NULL CHECK(month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
 payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB)) <= 65536),
 source_hash TEXT NOT NULL,
 retrieved_at TEXT NOT NULL,
 -- Month first: every read is a recent-month range, so it never scans the table.
 PRIMARY KEY(month, operation_id)
);
