-- Two bounded CURRENT records, plus two independent attempt/lease records.
-- Canonical writes exclude retrieval-only changes; no raw HTML or unlimited history.
CREATE TABLE IF NOT EXISTS duty_free_exchange_current (
  vendor TEXT PRIMARY KEY CHECK (vendor IN ('shilla', 'shinsegae')),
  service_date_kst TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  krw_per_unit REAL NOT NULL CHECK (krw_per_unit > 0),
  first_verified_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope = 'INTERNET_SHOP'),
  source_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS duty_free_exchange_attempt (
  vendor TEXT PRIMARY KEY CHECK (vendor IN ('shilla', 'shinsegae')),
  attempt_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'ERROR', 'BLOCKED', 'RUNNING')),
  error_code TEXT,
  last_success_at TEXT,
  next_due_at TEXT NOT NULL,
  lease_id TEXT,
  lease_until TEXT NOT NULL
);
