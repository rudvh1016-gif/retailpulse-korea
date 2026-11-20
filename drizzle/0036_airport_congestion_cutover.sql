CREATE TABLE a4_pointer (
  terminal TEXT PRIMARY KEY NOT NULL CHECK(terminal IN ('T1','T2')),
  observed_at TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest)=64),
  row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE a4_cutover (
  terminal TEXT PRIMARY KEY NOT NULL CHECK(terminal IN ('T1','T2')),
  cutover_at TEXT
);
