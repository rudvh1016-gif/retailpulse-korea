-- Standby congestion captures use an isolated database.
CREATE TABLE a4_generation (
  digest TEXT PRIMARY KEY NOT NULL CHECK(length(digest)=64),
  terminal TEXT NOT NULL CHECK(terminal IN ('T1','T2')),
  observed_at TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 60),
  payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=49152)
);

CREATE TRIGGER a4_generation_no_update BEFORE UPDATE ON a4_generation
BEGIN SELECT RAISE(ABORT,'immutable_generation'); END;

CREATE TRIGGER a4_generation_no_delete BEFORE DELETE ON a4_generation
BEGIN SELECT RAISE(ABORT,'immutable_generation'); END;
