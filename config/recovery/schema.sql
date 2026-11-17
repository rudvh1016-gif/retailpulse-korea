-- ACTIVE database only, explicit opt-in setup. Never part of automatic drizzle migrations.
CREATE TABLE recovery_public_snapshots (
 source TEXT PRIMARY KEY, published_at TEXT NOT NULL, payload TEXT NOT NULL CHECK(length(payload)<=131072)
);
