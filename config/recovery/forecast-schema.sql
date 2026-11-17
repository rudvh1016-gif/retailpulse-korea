-- Apply only to each separately approved A5 or weather ACTIVE database. Never automatic original migrations.
CREATE TABLE recovery_forecast_publications (
 family TEXT PRIMARY KEY CHECK(family IN ('A5','WEATHER')),
 checked_at TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(length(payload)<=262144)
);
