# EVN country history repair — 2026-10-30

Stored Incheon destination `쯔바르트노츠` is mapped to EVN / Armenia (AM).
Official evidence: https://www.zvartnots.aero/EN/index (EVN, ZVARTNOTS-YEREVAN) and https://www.zvartnots.aero/EN/Content (Republic of Armenia contact address; see /EN/Content/Contact).

The country history reader resolves stored destination names using the current reviewed mapping. No airport_flights or airport_daily_composition writes, backfill, source recollection, scheduling, credentials or billing changes are needed. Stored scheduled departures do not establish completed operations or passenger nationality. Unknown destinations still withhold country completeness; the regression covers this guard and reclassification from saved profiles.

Expected operational verification: 2026-10-07 retains 573 stored records; CN has 140 departures; October 1–7 regains seven complete country days (966/7, rounded 138/day). These are expected values pending deployment verification, not a claim of production recovery. PAGE_32 and daily D1 quota exhaustion are separate incidents.

Local validation: related 13 tests pass; JSON parses; diff whitespace check passes. Full CI and deployment evidence belong in the repair PR. No operational database backup is needed because this change performs no data mutation.
