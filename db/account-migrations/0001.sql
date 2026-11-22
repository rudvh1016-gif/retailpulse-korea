-- Private account DB only. Never apply this migration to the public collector DB.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL, google_sub TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS account_sessions (token_hash TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS account_sessions_owner ON account_sessions(account_id);
CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS account_oauth_flows (state_hash TEXT PRIMARY KEY NOT NULL, cookie_hash TEXT NOT NULL, encrypted_verifier TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS account_oauth_expiry ON account_oauth_flows(expires_at);
CREATE TABLE IF NOT EXISTS account_documents (account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, revision TEXT NOT NULL, encrypted_state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account_quotas (bucket TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS account_quota_expiry ON account_quotas(expires_at);

-- Remove the one account-owned counter in the same statement as account deletion.
CREATE TRIGGER IF NOT EXISTS account_quota_delete AFTER DELETE ON accounts
BEGIN DELETE FROM account_quotas WHERE bucket='account:' || OLD.id; END;
