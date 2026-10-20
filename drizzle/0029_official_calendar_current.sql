-- Two bounded current records, no raw pages or unlimited history. Verified event
-- payload survives failed refreshes; attempt time and verification time differ.
CREATE TABLE official_calendar_current (
 country TEXT PRIMARY KEY CHECK(country IN ('JP','US')),
 payload TEXT,
 semantic_hash TEXT,
 source_hash TEXT,
 last_verified_at TEXT,
 checked_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('VERIFIED','ERROR','REVIEW_REQUIRED')),
 reason TEXT,
 CHECK(payload IS NULL OR length(payload)<=250000),
 CHECK(semantic_hash IS NULL OR length(semantic_hash)=64),
 CHECK(source_hash IS NULL OR length(source_hash)=64)
);
