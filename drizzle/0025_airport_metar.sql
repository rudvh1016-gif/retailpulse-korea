-- Prepared only. No backfill, provider request or source activation.
CREATE TABLE IF NOT EXISTS airport_metar_current (
  station TEXT PRIMARY KEY CHECK (station = 'RKSI'),
  observed_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  observation_json TEXT NOT NULL CHECK (length(observation_json) <= 4096),
  source_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS airport_metar_attempt (
  station TEXT PRIMARY KEY CHECK (station = 'RKSI'),
  attempted_at TEXT,
  status TEXT,
  observation_hash TEXT,
  claimed_at TEXT NOT NULL,
  next_allowed_at TEXT NOT NULL,
  lease_id TEXT,
  lease_until TEXT NOT NULL
);
