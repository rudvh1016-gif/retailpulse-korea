-- One durable batch claim per Cloudflare billing day. No historical rows are
-- deleted by the migration itself.
CREATE TABLE IF NOT EXISTS retired_seoul_cleanup_days (
  day TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  recovery_bookmark TEXT NOT NULL
);
