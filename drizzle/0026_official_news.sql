-- Prepared only: do not apply remotely without separate approval.
-- Canonical current + meaningful revisions; no raw HTML/PDF/photo retention.
CREATE TABLE official_news_current (
 source TEXT NOT NULL CHECK(source IN ('airport','customs','law')),
 source_id TEXT NOT NULL,
 topic TEXT NOT NULL CHECK(topic IN ('airport','customs','unclassified')),
 published_at TEXT,
 may_publish INTEGER NOT NULL CHECK(may_publish IN (0,1)),
 semantic_hash TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB)) <= 8192),
 received_at TEXT NOT NULL,
 PRIMARY KEY(source,source_id)
);
CREATE INDEX official_news_public_idx ON official_news_current(may_publish,topic,published_at DESC);
CREATE TABLE official_news_revision (
 revision_id INTEGER PRIMARY KEY,
 source TEXT NOT NULL,
 source_id TEXT NOT NULL,
 semantic_hash TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB)) <= 8192),
 received_at TEXT NOT NULL
);
CREATE TRIGGER official_news_current_capacity BEFORE INSERT ON official_news_current
 WHEN NOT EXISTS(SELECT 1 FROM official_news_current WHERE source=NEW.source AND source_id=NEW.source_id)
 AND (SELECT COUNT(*) FROM official_news_current)>=200
 BEGIN SELECT RAISE(ABORT,'NEWS_STORAGE_LIMIT'); END;
CREATE TRIGGER official_news_revision_capacity BEFORE INSERT ON official_news_revision
 WHEN (SELECT COUNT(*) FROM official_news_revision)>=400
 BEGIN SELECT RAISE(ABORT,'NEWS_STORAGE_LIMIT'); END;
