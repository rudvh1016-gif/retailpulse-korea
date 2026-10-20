-- Bounded current observation only. No raw official pages or private traveller data.
-- Canonical reviewed allowances remain in the versioned dataset; failures never replace them.
CREATE TABLE customs_allowance_observations (
 source_id TEXT PRIMARY KEY CHECK(length(source_id)=5),
 jurisdiction TEXT NOT NULL CHECK(length(jurisdiction)=2),
 source_url TEXT NOT NULL CHECK(length(source_url)<=2048),
 state TEXT NOT NULL CHECK(state IN ('UNCHANGED_SOURCE','NUMERIC_TEMPLATE_VERIFIED','SOURCE_CHANGED_REVIEW_REQUIRED','BASELINE_REVIEW_REQUIRED','COLLECTION_BLOCKED','COLLECTION_FAILED')),
 checked_at TEXT NOT NULL,
 source_sha256 TEXT,
 reason TEXT,
 last_good_hash TEXT NOT NULL CHECK(length(last_good_hash)=64),
 last_good_verified_at TEXT,
 next_check_at TEXT NOT NULL,
 CHECK(source_sha256 IS NULL OR length(source_sha256)=64)
);
CREATE INDEX customs_allowance_country_idx ON customs_allowance_observations(jurisdiction);
CREATE TRIGGER customs_allowance_observation_capacity BEFORE INSERT ON customs_allowance_observations
 WHEN NOT EXISTS(SELECT 1 FROM customs_allowance_observations WHERE source_id=NEW.source_id)
 AND (SELECT COUNT(*) FROM customs_allowance_observations)>=24
 BEGIN SELECT RAISE(ABORT,'CUSTOMS_ALLOWANCE_STORAGE_LIMIT'); END;
-- Only the reviewed Japan scalar template can update this bounded public projection.
CREATE TABLE customs_allowance_numeric_current (
 jurisdiction TEXT PRIMARY KEY CHECK(jurisdiction='JP'),
 source_id TEXT NOT NULL CHECK(source_id='JP-01'),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 template_sha256 TEXT NOT NULL CHECK(length(template_sha256)=64),
 dataset_hash TEXT NOT NULL CHECK(length(dataset_hash)=64),
 values_json TEXT NOT NULL CHECK(length(CAST(values_json AS BLOB))<=1024),
 updated_at TEXT NOT NULL,
 changed_at TEXT,
 previous_values_json TEXT CHECK(previous_values_json IS NULL OR length(CAST(previous_values_json AS BLOB))<=1024)
);
