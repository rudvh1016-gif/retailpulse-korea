-- OFF until an operator verifies current account usage and sets a measured
-- daily_limit. No historical seed: started_at stays NULL until the first view.
CREATE TABLE pageview_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  daily_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_limit BETWEEN 0 AND 10000),
  admission_limit INTEGER NOT NULL DEFAULT 0 CHECK (admission_limit BETWEEN 0 AND 10000),
  admission_day TEXT NOT NULL DEFAULT '',
  admission_count INTEGER NOT NULL DEFAULT 0,
  budget_day TEXT NOT NULL DEFAULT '',
  budget_count INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL DEFAULT '',
  today INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  partial_day TEXT NOT NULL DEFAULT '',
  incomplete INTEGER NOT NULL DEFAULT 0 CHECK (incomplete IN (0, 1))
);
INSERT INTO pageview_totals(id) VALUES (1);

-- Random per-navigation event IDs, not cookies, sessions, IPs or user IDs.
-- Ten-minute expiry; bounded cleanup on incoming requests; no raw URL/path.
CREATE TABLE pageview_receipts (
  event_id TEXT PRIMARY KEY NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX pageview_receipts_received_idx ON pageview_receipts(received_at);

CREATE TRIGGER pageview_receipts_guard BEFORE INSERT ON pageview_receipts BEGIN
  -- A duplicate at the budget edge must not create a false gap.
  SELECT CASE WHEN EXISTS (SELECT 1 FROM pageview_receipts WHERE event_id = NEW.event_id)
    THEN RAISE(IGNORE) END;
  SELECT CASE WHEN (SELECT enabled = 0 OR partial_day >= strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch', '+9 hours') FROM pageview_totals WHERE id = 1)
    THEN RAISE(IGNORE) END;
  UPDATE pageview_totals SET incomplete = 1,
    partial_day = MAX(partial_day, strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch', '+9 hours'))
    WHERE id = 1 AND
      (daily_limit = 0 OR (budget_day >= strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch') AND budget_count >= daily_limit));
  -- Keep the gap flag: IGNORE does not roll back the preceding UPDATE.
  SELECT CASE WHEN (SELECT partial_day FROM pageview_totals WHERE id = 1) >= strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch', '+9 hours')
    THEN RAISE(IGNORE) END;
END;

-- Concurrent requests can finish out of order around midnight. Buckets only
-- move forward. A late prior-KST-day event increments total, not today's count.
-- Late prior-UTC-day events consume the current budget conservatively.
CREATE TRIGGER pageview_receipts_count AFTER INSERT ON pageview_receipts BEGIN
  UPDATE pageview_totals SET
    today = CASE WHEN day = strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch', '+9 hours') THEN today + 1
      WHEN day < strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch', '+9 hours') THEN 1 ELSE today END,
    day = MAX(day, strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch', '+9 hours')),
    total = total + 1,
    started_at = COALESCE(started_at, NEW.received_at),
    budget_count = CASE WHEN budget_day >= strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch') THEN budget_count + 1 ELSE 1 END,
    budget_day = MAX(budget_day, strftime('%Y-%m-%d', NEW.received_at / 1000, 'unixepoch'))
  WHERE id = 1;
END;
