-- Local-review only: apply before opting into completed-day reuse
-- No raw backfill, provider calls, or operational activation
CREATE TABLE airport_composition_observer (id INTEGER PRIMARY KEY CHECK(id=1),epoch TEXT NOT NULL);
INSERT INTO airport_composition_observer VALUES(1,lower(hex(randomblob(16))));
CREATE TABLE airport_composition_generations (day TEXT PRIMARY KEY NOT NULL,token TEXT NOT NULL);
CREATE TRIGGER airport_composition_insert AFTER INSERT ON airport_flights BEGIN
  INSERT INTO airport_composition_generations(day,token) SELECT substr(NEW.scheduled_at,1,10),lower(hex(randomblob(16))) WHERE NEW.direction='departure' AND NEW.physical_flight_id IS NOT NULL ON CONFLICT(day) DO UPDATE SET token=excluded.token;
END;
CREATE TRIGGER airport_composition_delete AFTER DELETE ON airport_flights BEGIN
  INSERT INTO airport_composition_generations(day,token) SELECT substr(OLD.scheduled_at,1,10),lower(hex(randomblob(16))) WHERE OLD.direction='departure' AND OLD.physical_flight_id IS NOT NULL ON CONFLICT(day) DO UPDATE SET token=excluded.token;
END;
CREATE TRIGGER airport_composition_update AFTER UPDATE OF direction,physical_flight_id,scheduled_at,flight_number,terminal,gate,status,airport_code,retrieved_at ON airport_flights
WHEN OLD.direction IS NOT NEW.direction OR OLD.physical_flight_id IS NOT NEW.physical_flight_id OR OLD.scheduled_at IS NOT NEW.scheduled_at OR OLD.flight_number IS NOT NEW.flight_number OR OLD.terminal IS NOT NEW.terminal OR OLD.gate IS NOT NEW.gate OR OLD.status IS NOT NEW.status OR OLD.airport_code IS NOT NEW.airport_code OR OLD.retrieved_at IS NOT NEW.retrieved_at
BEGIN
  INSERT INTO airport_composition_generations(day,token) SELECT substr(OLD.scheduled_at,1,10),lower(hex(randomblob(16))) WHERE OLD.direction='departure' AND OLD.physical_flight_id IS NOT NULL ON CONFLICT(day) DO UPDATE SET token=excluded.token;
  INSERT INTO airport_composition_generations(day,token) SELECT substr(NEW.scheduled_at,1,10),lower(hex(randomblob(16))) WHERE NEW.direction='departure' AND NEW.physical_flight_id IS NOT NULL AND NOT (OLD.direction='departure' AND OLD.physical_flight_id IS NOT NULL AND substr(OLD.scheduled_at,1,10)=substr(NEW.scheduled_at,1,10)) ON CONFLICT(day) DO UPDATE SET token=excluded.token;
END;
