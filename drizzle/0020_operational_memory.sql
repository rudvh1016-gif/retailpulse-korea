-- Phase 2: additive operational memory only. No historical/product rows touched.
-- Wrangler's SQL-file migration history is canonical; do not rewrite the old Drizzle journal.
CREATE TABLE IF NOT EXISTS operational_incidents (
 fingerprint TEXT PRIMARY KEY NOT NULL,
 source_id TEXT NOT NULL, failure_class TEXT NOT NULL, contract_version TEXT NOT NULL,
 logical_job TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
 occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK(occurrence_count > 0),
 current_state TEXT NOT NULL DEFAULT 'OPEN', last_good_at TEXT,
 recovery_attempts INTEGER NOT NULL DEFAULT 0, last_recovery_result TEXT, resolved_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS operational_incident_source_idx ON operational_incidents(source_id, logical_job, contract_version);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS operational_incident_events (
 event_id TEXT PRIMARY KEY NOT NULL,
 fingerprint TEXT NOT NULL, source_id TEXT NOT NULL, failure_class TEXT NOT NULL,
 contract_version TEXT NOT NULL, logical_job TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('FAILURE','RECOVERY_STARTED','RECOVERY_RESULT','HUMAN_REVIEW','HEALTHY')),
 run_id TEXT NOT NULL CHECK(length(run_id) <= 200), at TEXT NOT NULL,
 evidence TEXT NOT NULL CHECK(length(evidence) <= 500),
 verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)), last_good_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS operational_event_incident_idx ON operational_incident_events(fingerprint, at DESC);
--> statement-breakpoint
-- Insert-once events make retries atomic: a response lost after commit cannot count twice.
CREATE TRIGGER IF NOT EXISTS operational_event_fold AFTER INSERT ON operational_incident_events
BEGIN
 INSERT INTO operational_incidents(fingerprint,source_id,failure_class,contract_version,logical_job,first_seen,last_seen,last_good_at)
 SELECT NEW.fingerprint,NEW.source_id,NEW.failure_class,NEW.contract_version,NEW.logical_job,NEW.at,NEW.at,NEW.last_good_at
 WHERE NEW.kind='FAILURE'
 ON CONFLICT(fingerprint) DO UPDATE SET
  occurrence_count=operational_incidents.occurrence_count+1,
  first_seen=MIN(operational_incidents.first_seen,excluded.first_seen),
  last_seen=MAX(operational_incidents.last_seen,excluded.last_seen),
  current_state=CASE WHEN excluded.last_seen<operational_incidents.last_seen THEN operational_incidents.current_state
    WHEN operational_incidents.current_state='HUMAN_REVIEW_REQUIRED' THEN 'HUMAN_REVIEW_REQUIRED' ELSE 'OPEN' END,
  resolved_at=CASE WHEN excluded.last_seen<operational_incidents.last_seen THEN operational_incidents.resolved_at ELSE NULL END,
  last_good_at=CASE WHEN operational_incidents.last_good_at IS NULL THEN excluded.last_good_at
    WHEN excluded.last_good_at>operational_incidents.last_good_at THEN excluded.last_good_at ELSE operational_incidents.last_good_at END;
 UPDATE operational_incidents SET
  recovery_attempts=recovery_attempts+CASE WHEN NEW.kind='RECOVERY_STARTED' THEN 1 ELSE 0 END,
  current_state=CASE WHEN NEW.at<last_seen THEN current_state
    WHEN NEW.kind='RECOVERY_STARTED' THEN 'RECOVERING'
    WHEN NEW.kind='HUMAN_REVIEW' THEN 'HUMAN_REVIEW_REQUIRED'
    WHEN NEW.verified=1 AND NEW.kind IN ('HEALTHY','RECOVERY_RESULT') THEN 'RESOLVED' ELSE 'DEGRADED' END,
  resolved_at=CASE WHEN NEW.at<last_seen THEN resolved_at WHEN NEW.verified=1 THEN NEW.at ELSE NULL END,
  last_good_at=CASE WHEN NEW.verified=1 AND (last_good_at IS NULL OR NEW.at>last_good_at) THEN NEW.at ELSE last_good_at END,
  last_seen=MAX(last_seen,NEW.at),
  last_recovery_result=CASE WHEN NEW.kind IN ('RECOVERY_RESULT','HUMAN_REVIEW') THEN NEW.evidence ELSE last_recovery_result END
 WHERE fingerprint=NEW.fingerprint AND NEW.kind<>'FAILURE';
END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS operational_recovery_attempts (
 attempt_id TEXT PRIMARY KEY NOT NULL, execution_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, source_id TEXT NOT NULL, failure_class TEXT NOT NULL,
 contract_version TEXT NOT NULL, logical_job TEXT NOT NULL, target_date TEXT NOT NULL,
 scheduled_slot TEXT NOT NULL, operation TEXT NOT NULL, attempt_number INTEGER NOT NULL,
 started_at TEXT NOT NULL, completed_at TEXT,
 data_valid INTEGER CHECK(data_valid IN (0,1)), storage_valid INTEGER CHECK(storage_valid IN (0,1)),
 public_valid INTEGER CHECK(public_valid IN (0,1)),
 outcome TEXT NOT NULL DEFAULT 'RECOVERY_STARTED', verified INTEGER NOT NULL DEFAULT 0,
 provider_requests INTEGER, rows_read INTEGER, rows_written INTEGER, duration_ms INTEGER,
 escalation_required INTEGER NOT NULL DEFAULT 0,
 mode TEXT NOT NULL CHECK(mode IN ('EXISTING_RUN','CONTROLLED')),
 CHECK(verified IN (0,1)),
 CHECK(verified=0 OR (data_valid IS 1 AND storage_valid IS 1 AND public_valid IS 1 AND outcome='RECOVERED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS operational_attempt_budget_idx ON operational_recovery_attempts(source_id,logical_job,target_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS operational_attempt_execution_idx ON operational_recovery_attempts(execution_id,started_at);
--> statement-breakpoint
-- Lock applies across slots too. It is never leased/expired by wall clock.
CREATE UNIQUE INDEX IF NOT EXISTS operational_attempt_inflight_idx
 ON operational_recovery_attempts(source_id,logical_job) WHERE completed_at IS NULL AND mode='CONTROLLED';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS operational_source_state (
 source_id TEXT PRIMARY KEY NOT NULL, logical_job TEXT NOT NULL, run_id TEXT NOT NULL,
 checked_at TEXT NOT NULL, contract_version TEXT NOT NULL, last_good_at TEXT,
 data_valid INTEGER, storage_valid INTEGER, public_valid INTEGER,
 collector_status TEXT NOT NULL, stored_rows INTEGER, evidence TEXT NOT NULL CHECK(length(evidence)<=500),
 execution_platform TEXT NOT NULL, trigger_evidence TEXT NOT NULL DEFAULT 'UNKNOWN'
);
--> statement-breakpoint
-- Compact per-source UTC-day counters. These are observed lower bounds, NOT account usage.
CREATE TABLE IF NOT EXISTS operational_usage_daily (
 day TEXT NOT NULL, source_id TEXT NOT NULL, executions INTEGER NOT NULL,
 provider_requests INTEGER NOT NULL DEFAULT 0, provider_measured INTEGER NOT NULL DEFAULT 0,
 rows_read INTEGER NOT NULL DEFAULT 0, rows_written INTEGER NOT NULL DEFAULT 0,
 d1_measured INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,source_id)
);
