-- Replaceable near-term schedule snapshot, separate from observed flight history.
CREATE TABLE airport_departure_schedule (
  service_date TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  retrieved_at TEXT NOT NULL
);
