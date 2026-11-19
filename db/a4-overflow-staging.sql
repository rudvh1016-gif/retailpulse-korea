-- Isolated pilot schema only. Not a primary migration or activation.
-- Immutable manifest/publication and the required atomic incident CAS are not yet integrated.
CREATE TABLE airport_congestion (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  record_origin TEXT NOT NULL,
  terminal TEXT NOT NULL,
  zone TEXT NOT NULL,
  wait_time_minutes INTEGER,
  wait_time_raw TEXT,
  waiting_count INTEGER,
  observed_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  freshness TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  quality_status TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  CHECK (
    (terminal = 'T1' AND source_id = 'INCHEON_DEPARTURE_CONGESTION')
    OR (terminal = 'T2' AND source_id = 'INCHEON_DEPARTURE_CONGESTION_T2')
  )
);
CREATE UNIQUE INDEX airport_congestion_observed_unique
  ON airport_congestion (source_id, terminal, zone, observed_at);
CREATE INDEX airport_congestion_terminal_observed_idx
  ON airport_congestion (terminal, observed_at);
