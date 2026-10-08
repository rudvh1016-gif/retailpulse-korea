CREATE TABLE IF NOT EXISTS duty_free_exchange_daily (
  vendor TEXT NOT NULL CHECK (vendor IN ('shilla', 'shinsegae')),
  service_date_kst TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  krw_per_unit REAL NOT NULL CHECK (krw_per_unit > 0),
  first_verified_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope = 'INTERNET_SHOP'),
  date_evidence TEXT NOT NULL CHECK (date_evidence IN ('CURRENT_WIDGET', 'EXPLICIT_SOURCE_DATE')),
  source_hash TEXT NOT NULL,
  PRIMARY KEY (vendor, service_date_kst)
);
--> statement-breakpoint
-- Preserve the one actually stored publication, with its original date and clock.
INSERT INTO duty_free_exchange_daily
  (vendor, service_date_kst, currency, krw_per_unit, first_verified_at, source_url, scope, date_evidence, source_hash)
SELECT vendor, service_date_kst, currency, krw_per_unit, first_verified_at, source_url, scope, 'CURRENT_WIDGET', source_hash
FROM duty_free_exchange_current WHERE vendor = 'shilla'
ON CONFLICT(vendor, service_date_kst) DO NOTHING;
