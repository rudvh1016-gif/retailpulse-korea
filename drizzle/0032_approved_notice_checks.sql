-- Fixed-size metadata only; no raw notices or canonical calendar dates.
CREATE TABLE approved_notice_checks (
 source_id TEXT PRIMARY KEY NOT NULL CHECK(source_id IN ('KR_ANNUAL_2026','KR_ANNUAL_2027')),
 checked_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(length(state)<=4096 AND json_valid(state))
);
