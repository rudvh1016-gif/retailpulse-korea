-- Explicit arrival-based transfer security forecast, NEVER added to A5.
CREATE TABLE IF NOT EXISTS airport_transfer_forecast (
  source_id TEXT NOT NULL,
  service_date TEXT NOT NULL,
  terminal TEXT NOT NULL CHECK (terminal IN ('T1', 'T2')),
  expected_transfer_passengers INTEGER NOT NULL CHECK (expected_transfer_passengers >= 0),
  basis TEXT NOT NULL CHECK (basis = 'ARRIVAL_TRANSFER_SECURITY'),
  published_at TEXT,
  retrieved_at TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  quality_status TEXT NOT NULL CHECK (quality_status = 'OFFICIAL_FORECAST'),
  schema_version TEXT NOT NULL,
  PRIMARY KEY (service_date, terminal)
);
