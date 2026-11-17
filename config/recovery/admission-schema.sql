-- Explicit active-only candidate schema. Not an automatic migration. Never apply to original.
-- No grant issuer/reset API; trusted provisioning is a separately reviewed future action.
CREATE TABLE admission(
 database_id TEXT PRIMARY KEY, epoch TEXT NOT NULL, source TEXT NOT NULL,
 commit_sha TEXT NOT NULL CHECK(length(commit_sha)=40), expires_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('READY','INFLIGHT','DONE','BLOCKED','UNCERTAIN')),
 request_id TEXT, owner TEXT
);
