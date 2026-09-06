-- The forecast archive triggers could abort the write they were meant to record.
--
-- Both triggers said `INSERT OR IGNORE INTO airport_forecast_versions`, which
-- reads as "archive this version, and say nothing if it is already archived".
-- SQLite does not honour that here. From CREATE TRIGGER: when the statement
-- that fires a trigger specifies its own ON CONFLICT clause, the OUTER
-- statement's conflict policy replaces the one written inside the trigger body.
--
-- Every canonical A5 write is an upsert -- `ON CONFLICT(...) DO UPDATE SET ...
-- WHERE source_hash <> excluded.source_hash`, which is how changed-only writing
-- works -- so the trigger's IGNORE became the outer statement's ABORT.
--
-- The consequence was exact and total. The AFTER UPDATE trigger re-archives the
-- OLD version, which the AFTER INSERT trigger had already archived under the
-- same `id || ':' || source_hash`. So the FIRST time Incheon published a
-- revised number for an aggregate band, the archive insert conflicted and took
-- the entire batch down with it:
--
--   d1_http_400_7500 UNIQUE constraint failed: airport_forecast_versions.id
--
-- Reproduced on SQLite 3.51.2 with the exact statements: insert succeeds,
-- the first revision fails, every later revision fails.
--
-- A months-long provider outage hid it. While no runner could open a connection
-- to apis.data.go.kr, no rows were ever normalized, so the write never ran. The
-- moment a fresh runner reached the provider again, this is what stopped
-- 2026-09-07 from ever being stored.
--
-- The repair does not depend on conflict resolution at all: each archive insert
-- carries its own WHERE NOT EXISTS. No outer statement can override a WHERE
-- clause. Data is untouched -- the archive stays immutable and append-only, the
-- two guard triggers are left exactly as they are, and nothing is deleted.
DROP TRIGGER IF EXISTS airport_forecast_archive_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS airport_forecast_archive_update;
--> statement-breakpoint
CREATE TRIGGER airport_forecast_archive_insert AFTER INSERT ON airport_passenger_forecast
WHEN NEW.is_aggregate = 1
BEGIN
 INSERT INTO airport_forecast_versions
 SELECT NEW.id || ':' || NEW.source_hash, NEW.id, NEW.source_hash, NEW.terminal, NEW.direction,
   NEW.target_start_at, NEW.expected_passengers, NEW.retrieved_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE NOT EXISTS (SELECT 1 FROM airport_forecast_versions WHERE id = NEW.id || ':' || NEW.source_hash);
END;
--> statement-breakpoint
CREATE TRIGGER airport_forecast_archive_update AFTER UPDATE ON airport_passenger_forecast
WHEN NEW.is_aggregate = 1 AND NEW.source_hash <> OLD.source_hash
BEGIN
 INSERT INTO airport_forecast_versions
 SELECT OLD.id || ':' || OLD.source_hash, OLD.id, OLD.source_hash, OLD.terminal, OLD.direction,
   OLD.target_start_at, OLD.expected_passengers, OLD.retrieved_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE NOT EXISTS (SELECT 1 FROM airport_forecast_versions WHERE id = OLD.id || ':' || OLD.source_hash);
 INSERT INTO airport_forecast_versions
 SELECT NEW.id || ':' || NEW.source_hash, NEW.id, NEW.source_hash, NEW.terminal, NEW.direction,
   NEW.target_start_at, NEW.expected_passengers, NEW.retrieved_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE NOT EXISTS (SELECT 1 FROM airport_forecast_versions WHERE id = NEW.id || ':' || NEW.source_hash);
END;
