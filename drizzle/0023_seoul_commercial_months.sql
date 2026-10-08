-- Derived observed-window summaries, separate from immutable forecasts/outcomes.
-- Compact monthly results survive the existing 90-day raw retention.
CREATE TABLE IF NOT EXISTS seoul_commercial_months (
 area TEXT NOT NULL,
 month TEXT NOT NULL,
 payload TEXT NOT NULL,
 source_hash TEXT NOT NULL,
 calculated_at TEXT NOT NULL,
 PRIMARY KEY(area,month)
);
