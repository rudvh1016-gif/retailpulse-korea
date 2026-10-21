-- Expand the bounded current table to three countries. Preserve every prior row.
CREATE TABLE official_calendar_current_expanded (
 country TEXT PRIMARY KEY CHECK(country IN ('JP','US','SG')),
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

INSERT INTO official_calendar_current_expanded SELECT * FROM official_calendar_current;
DROP TABLE official_calendar_current;
ALTER TABLE official_calendar_current_expanded RENAME TO official_calendar_current;
