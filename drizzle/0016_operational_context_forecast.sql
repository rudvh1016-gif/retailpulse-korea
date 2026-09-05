-- Additive migration: existing canonical data and immutable predictions remain intact.
CREATE TABLE seoul_context (
 area TEXT NOT NULL, observed_at TEXT NOT NULL, retrieved_at TEXT NOT NULL,
 payload TEXT NOT NULL, source_hash TEXT NOT NULL,
 PRIMARY KEY(area, observed_at)
);
--> statement-breakpoint
CREATE TABLE holiday_months (
 month TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, retrieved_at TEXT NOT NULL,
 source_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE forecast_runs (
 area TEXT NOT NULL, target_date TEXT NOT NULL, created_at TEXT NOT NULL,
 payload TEXT NOT NULL, PRIMARY KEY(area,target_date)
);
--> statement-breakpoint
CREATE TABLE prediction_inputs (
 prediction_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX predictions_area_target_idx ON predictions(area,target_at);
--> statement-breakpoint
CREATE TABLE airport_forecast_versions (
 id TEXT PRIMARY KEY NOT NULL, canonical_id TEXT NOT NULL, source_hash TEXT NOT NULL,
 terminal TEXT NOT NULL, direction TEXT NOT NULL, target_at TEXT NOT NULL,
 expected_passengers INTEGER, retrieved_at TEXT NOT NULL, archived_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX airport_forecast_versions_target_idx ON airport_forecast_versions(target_at);
--> statement-breakpoint
CREATE TRIGGER airport_forecast_archive_insert AFTER INSERT ON airport_passenger_forecast
WHEN NEW.is_aggregate = 1
BEGIN
 INSERT OR IGNORE INTO airport_forecast_versions VALUES (
 NEW.id || ':' || NEW.source_hash, NEW.id, NEW.source_hash, NEW.terminal, NEW.direction,
 NEW.target_start_at, NEW.expected_passengers, NEW.retrieved_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
--> statement-breakpoint
CREATE TRIGGER airport_forecast_archive_update AFTER UPDATE ON airport_passenger_forecast
WHEN NEW.is_aggregate = 1 AND NEW.source_hash <> OLD.source_hash
BEGIN
 INSERT OR IGNORE INTO airport_forecast_versions VALUES (
 OLD.id || ':' || OLD.source_hash, OLD.id, OLD.source_hash, OLD.terminal, OLD.direction,
 OLD.target_start_at, OLD.expected_passengers, OLD.retrieved_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
 INSERT OR IGNORE INTO airport_forecast_versions VALUES (
 NEW.id || ':' || NEW.source_hash, NEW.id, NEW.source_hash, NEW.terminal, NEW.direction,
 NEW.target_start_at, NEW.expected_passengers, NEW.retrieved_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
--> statement-breakpoint
CREATE TRIGGER airport_forecast_versions_no_update BEFORE UPDATE ON airport_forecast_versions BEGIN SELECT RAISE(ABORT,'archive is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER airport_forecast_versions_no_delete BEFORE DELETE ON airport_forecast_versions BEGIN SELECT RAISE(ABORT,'archive is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prediction_inputs_no_update BEFORE UPDATE ON prediction_inputs BEGIN SELECT RAISE(ABORT,'inputs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER prediction_inputs_no_delete BEFORE DELETE ON prediction_inputs BEGIN SELECT RAISE(ABORT,'inputs are immutable'); END;
--> statement-breakpoint
CREATE TABLE airport_daily_composition (
 day TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, source_hash TEXT NOT NULL, calculated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE forecast_maintenance (
 day TEXT PRIMARY KEY NOT NULL, completed_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX predictions_model_target_idx ON predictions(model_version,target_at);
--> statement-breakpoint
CREATE TABLE area_data_coverage (
 area TEXT PRIMARY KEY NOT NULL, calculated_at TEXT NOT NULL, payload TEXT NOT NULL
);
