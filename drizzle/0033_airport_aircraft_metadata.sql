-- Optional fields from the SAME A1 response. No backfill, new index, provider call or scheduler.
-- NULL remains unknown. Registration/subtype alone never proves a cabin configuration.
ALTER TABLE airport_flights ADD COLUMN aircraft_subtype TEXT;
ALTER TABLE airport_flights ADD COLUMN aircraft_reg_no TEXT;
ALTER TABLE airport_flight_changes ADD COLUMN aircraft_subtype TEXT;
ALTER TABLE airport_flight_changes ADD COLUMN aircraft_reg_no TEXT;
